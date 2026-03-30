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

type RequestTask = 'repair-json' | 'fill-descriptions' | 'suggest-mappings';

type RequestBody = {
  task?: RequestTask;
  payload?: Record<string, unknown>;
};

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
      'Не выдумывай поле, если оно не передано.',
      'Ответь строго JSON-объектом вида {"descriptions":[{"field":"...","description":"..."}]}',
      `SECTION_TYPE: ${String(payload.sectionType ?? 'generic')}`,
      `ROWS: ${JSON.stringify(payload.rows ?? [])}`
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      endpoint: '/api/ai',
      provider: 'openai',
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-nano',
      message: 'Use POST with JSON body: { task, payload }',
      tasks: ['repair-json', 'fill-descriptions', 'suggest-mappings']
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

    if (!task || !['repair-json', 'fill-descriptions', 'suggest-mappings'].includes(task)) {
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

    res.status(200).json({ data: normalizeMappingsResult(raw) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Внутренняя ошибка AI интеграции';
    res.status(500).json({ error: message });
  }
}