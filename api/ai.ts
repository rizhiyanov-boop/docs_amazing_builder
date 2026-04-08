type VercelRequest = {
  method?: string;
  body?: unknown;
};

declare const process: {
  env: Record<string, string | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type RequestTask = 'repair-json' | 'fill-descriptions' | 'suggest-mappings' | 'mask-fields' | 'build-validation-rules';

type RequestBody = {
  task?: RequestTask;
  payload?: Record<string, unknown>;
};

const ALLOWED_VALIDATION_CASES = new Set([
  'NotNull',
  'NotBlank',
  'NotEmpty',
  'Size',
  'Positive',
  'Negative',
  'Past',
  'Future',
  'PastOrPresent',
  'FutureOrPresent',
  'Pattern',
  'Digits',
  'Custom'
]);

const ARRAY_SEGMENT_PATTERN = /\[(?:\d+|[oO])\]/g;

function normalizeArrayFieldPath(path: string): string {
  if (!path) return path;
  return path.replace(ARRAY_SEGMENT_PATTERN, '[]');
}

function formatConditionBrackets(value: string): string {
  return value.replace(/\[\s*([^\]]*?)\s*\]/g, (_match, inner: string) => {
    const normalizedInner = inner.trim();
    if (!normalizedInner) return '[]';
    return `( ${normalizedInner} )`;
  });
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Модель вернула невалидный JSON');
  }
}

function buildTaskPrompt(task: RequestTask, payload: Record<string, unknown>): string {
  if (task === 'repair-json') {
    return [
      'Ты исправляешь только синтаксис JSON.',
      'Сохрани исходную структуру и смысл, не добавляй новые поля без необходимости.',
      'Ответь строго JSON-объектом вида {"fixedJson":"..."}.',
      `INPUT_JSON:\n${String(payload.input ?? '')}`
    ].join('\n');
  }

  if (task === 'fill-descriptions') {
    return [
      'Ты генерируешь короткие описания API-полей на русском языке.',
      'Максимум 120 символов на описание.',
      'Пиши описание только про бизнес-смысл поля.',
      'Не упоминай тип данных, обязательность, формат и технические пометки.',
      'Не выдумывай поле, если оно не передано.',
      'Ответь строго JSON-объектом вида {"descriptions":[{"field":"...","description":"..."}]}',
      `SECTION_TYPE: ${String(payload.sectionType ?? 'generic')}`,
      `ROWS: ${JSON.stringify(payload.rows ?? [])}`
    ].join('\n');
  }

  if (task === 'mask-fields') {
    return [
      'Ты находишь поля, которые нужно маскировать в логах.',
      'Маскируй персональные данные, секреты, учетные данные и токены.',
      'Примеры: password, token, secret, api key, pinfl, inn, phone, email, паспорт, карта.',
      'Если поле не чувствительное — не включай его.',
      'Ответь строго JSON-объектом вида {"fields":[{"field":"...","reason":"..."}]}.',
      `SECTION_TYPE: ${String(payload.sectionType ?? 'generic')}`,
      `ROWS: ${JSON.stringify(payload.rows ?? [])}`
    ].join('\n');
  }

  if (task === 'build-validation-rules') {
    return [
      'Ты анализируешь JSON Schema и формируешь строки таблицы валидации API.',
      'Работай строго по переданной схеме, не выдумывай поля.',
      'Для validationCase используй только значения из allowedValidationCases.',
      'condition пиши на русском, человекочитаемо.',
      'Если есть regex, расшифруй его словами и не выводи сырой regex в condition.',
      'Для нетипичных правил формируй осмысленный cause на английском в стиле ошибок валидации.',
      'Возвращай только непустые parameter, validationCase, condition, cause.',
      'Сгруппируй результат так, чтобы правила одного parameter шли подряд.',
      'Ответь строго JSON-объектом вида {"rules":[{"parameter":"...","validationCase":"...","condition":"...","cause":"..."}]}.',
      `ALLOWED_CASES: ${JSON.stringify(payload.allowedValidationCases ?? [])}`,
      `SCHEMA_JSON: ${String(payload.schemaInput ?? '')}`
    ].join('\n');
  }

  return [
    'Ты подбираешь маппинг server параметров к client параметрам.',
    'Сопоставляй по смыслу, snake/camel case, префиксам/суффиксам.',
    'Не возвращай дубликаты serverField.',
    'Ответь строго JSON-объектом вида {"mappings":[{"serverField":"...","clientField":"...","confidence":0.0}]}.',
    `SERVER_FIELDS: ${JSON.stringify(payload.serverFields ?? [])}`,
    `CLIENT_FIELDS: ${JSON.stringify(payload.clientFields ?? [])}`
  ].join('\n');
}

async function callOpenAi(prompt: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY не настроен на сервере');
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-nano';

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a strict API helper. Return JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  const body = await response.json() as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new Error(body.error?.message || 'Ошибка запроса к OpenAI');
  }

  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI вернул пустой ответ');
  }

  return extractJsonObject(content);
}

function normalizeRepairJsonResult(raw: unknown): { fixedJson: string } {
  const value = raw as { fixedJson?: unknown };
  if (typeof value.fixedJson !== 'string' || !value.fixedJson.trim()) {
    throw new Error('AI не вернул fixedJson');
  }
  return { fixedJson: value.fixedJson };
}

function normalizeDescriptionsResult(raw: unknown): { descriptions: Array<{ field: string; description: string }> } {
  const value = raw as { descriptions?: Array<{ field?: unknown; description?: unknown }> };
  const descriptions = Array.isArray(value.descriptions)
    ? value.descriptions
      .filter((row) => typeof row?.field === 'string' && typeof row?.description === 'string')
      .map((row) => ({ field: String(row.field).trim(), description: String(row.description).trim() }))
      .filter((row) => row.field && row.description)
    : [];
  return { descriptions };
}

function normalizeMappingsResult(raw: unknown): { mappings: Array<{ serverField: string; clientField: string; confidence?: number }> } {
  const value = raw as { mappings?: Array<{ serverField?: unknown; clientField?: unknown; confidence?: unknown }> };
  const mappings = Array.isArray(value.mappings)
    ? value.mappings
      .filter((row) => typeof row?.serverField === 'string' && typeof row?.clientField === 'string')
      .map((row) => ({
        serverField: String(row.serverField).trim(),
        clientField: String(row.clientField).trim(),
        confidence: typeof row.confidence === 'number' ? row.confidence : undefined
      }))
      .filter((row) => row.serverField && row.clientField)
    : [];
  return { mappings };
}

function normalizeMaskFieldsResult(raw: unknown): { fields: Array<{ field: string; reason?: string }> } {
  const value = raw as { fields?: Array<{ field?: unknown; reason?: unknown }> };
  const fields = Array.isArray(value.fields)
    ? value.fields
      .filter((row) => typeof row?.field === 'string')
      .map((row) => ({
        field: String(row.field).trim(),
        reason: typeof row.reason === 'string' ? String(row.reason).trim() : undefined
      }))
      .filter((row) => row.field)
    : [];
  return { fields };
}

function normalizeValidationCase(value: string): string {
  const compact = value.replaceAll(/[^a-z]/gi, '').toLowerCase();
  switch (compact) {
    case 'notnull': return 'NotNull';
    case 'notblank': return 'NotBlank';
    case 'notempty': return 'NotEmpty';
    case 'size': return 'Size';
    case 'positive': return 'Positive';
    case 'negative': return 'Negative';
    case 'past': return 'Past';
    case 'future': return 'Future';
    case 'pastorpresent': return 'PastOrPresent';
    case 'futureorpresent': return 'FutureOrPresent';
    case 'pattern': return 'Pattern';
    case 'digits': return 'Digits';
    case 'custom': return 'Custom';
    default: return value.trim();
  }
}

function normalizeValidationRulesResult(raw: unknown): {
  rules: Array<{ parameter: string; validationCase: string; condition: string; cause: string }>;
} {
  const value = raw as {
    rules?: Array<{
      parameter?: unknown;
      validationCase?: unknown;
      condition?: unknown;
      cause?: unknown;
    }>;
  };

  const dedupe = new Set<string>();
  const grouped = new Map<string, Array<{ parameter: string; validationCase: string; condition: string; cause: string }>>();

  const rules = Array.isArray(value.rules)
    ? value.rules
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const source = row as Record<string, unknown>;
        const parameter = source.parameter ?? source.field ?? source.path;
        const validationCase = source.validationCase ?? source.validationType ?? source.case ?? source.type;
        const condition = source.condition ?? source.rule ?? source.description;
        const cause = source.cause ?? source.reason ?? source.message;

        if (typeof parameter !== 'string') return null;
        if (typeof validationCase !== 'string') return null;
        if (typeof condition !== 'string') return null;
        if (typeof cause !== 'string') return null;

        return {
          parameter: parameter.trim(),
          validationCase: normalizeValidationCase(validationCase),
          condition: formatConditionBrackets(condition.trim()),
          cause: normalizeArrayFieldPath(cause.trim())
        };
      })
      .filter((row): row is { parameter: string; validationCase: string; condition: string; cause: string } => Boolean(row))
      .filter((row) => row.parameter && row.condition && row.cause && ALLOWED_VALIDATION_CASES.has(row.validationCase))
      .filter((row) => {
        const key = `${row.parameter.toLowerCase()}|${row.validationCase}|${row.condition.toLowerCase()}`;
        if (dedupe.has(key)) return false;
        dedupe.add(key);
        return true;
      })
    : [];

  for (const row of rules) {
    const bucket = grouped.get(row.parameter);
    if (bucket) bucket.push(row);
    else grouped.set(row.parameter, [row]);
  }

  return { rules: Array.from(grouped.values()).flat() };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      endpoint: '/api/ai',
      provider: 'openai',
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-nano',
      message: 'Use POST with JSON body: { task, payload }',
      tasks: ['repair-json', 'fill-descriptions', 'suggest-mappings', 'mask-fields', 'build-validation-rules']
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const body = (req.body ?? {}) as RequestBody;
    const task = body.task;
    const payload = body.payload ?? {};

    if (!task || !['repair-json', 'fill-descriptions', 'suggest-mappings', 'mask-fields', 'build-validation-rules'].includes(task)) {
      res.status(400).json({ error: 'Некорректный task' });
      return;
    }

    const prompt = buildTaskPrompt(task, payload);
    const raw = await callOpenAi(prompt);

    if (task === 'repair-json') {
      res.status(200).json({ data: normalizeRepairJsonResult(raw) });
      return;
    }

    if (task === 'fill-descriptions') {
      res.status(200).json({ data: normalizeDescriptionsResult(raw) });
      return;
    }

    if (task === 'mask-fields') {
      res.status(200).json({ data: normalizeMaskFieldsResult(raw) });
      return;
    }

    if (task === 'build-validation-rules') {
      res.status(200).json({ data: normalizeValidationRulesResult(raw) });
      return;
    }

    res.status(200).json({ data: normalizeMappingsResult(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Внутренняя ошибка AI интеграции';
    res.status(500).json({ error: message });
  }
}