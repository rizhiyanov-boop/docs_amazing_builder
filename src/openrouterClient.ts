type RepairJsonResponse = {
  fixedJson: string;
};

type DescriptionSuggestion = {
  field: string;
  description: string;
};

type FillDescriptionsResponse = {
  descriptions: DescriptionSuggestion[];
};

type MappingSuggestion = {
  serverField: string;
  clientField: string;
  confidence?: number;
};

type SuggestMappingsResponse = {
  mappings: MappingSuggestion[];
};

type MaskFieldSuggestion = {
  field: string;
  reason?: string;
};

type MaskFieldsResponse = {
  fields: MaskFieldSuggestion[];
};

type ApiTask = 'repair-json' | 'fill-descriptions' | 'suggest-mappings' | 'mask-fields';

type ApiRequestBody = {
  task: ApiTask;
  payload: Record<string, unknown>;
};

const AI_API_CANDIDATES = ['/api/ai', '/api/openrouter'];

async function callAiApi<T>(task: ApiTask, payload: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);

  try {
    let lastError: Error | null = null;

    for (const endpoint of AI_API_CANDIDATES) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ task, payload } satisfies ApiRequestBody),
          signal: controller.signal
        });

        const rawText = await response.text();
        const contentType = response.headers.get('content-type') ?? '';
        const looksLikeHtml = /^\s*</.test(rawText);

        let data: { error?: string; data?: T } = {};
        if (rawText) {
          try {
            data = JSON.parse(rawText) as { error?: string; data?: T };
          } catch {
            if (response.status === 404) {
              lastError = new Error(`${endpoint} не найден`);
              continue;
            }

            if (looksLikeHtml || !contentType.toLowerCase().includes('application/json')) {
              throw new Error('AI API вернул HTML вместо JSON. Проверьте, что запущен Vercel dev, а не только Vite dev.');
            }

            throw new Error('AI сервис вернул неожиданный ответ (не JSON)');
          }
        }

        if (!response.ok) {
          if (response.status === 404) {
            lastError = new Error(`${endpoint} не найден`);
            continue;
          }
          throw new Error(data.error || 'AI сервис временно недоступен');
        }

        if (!data.data) {
          throw new Error('AI сервис вернул пустой ответ');
        }

        return data.data;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('AI запрос превысил лимит ожидания (30с). Повторите попытку.');
        }

        const resolvedError = error instanceof Error ? error : new Error('AI сервис временно недоступен');
        const isNetworkError = /Failed to fetch|ERR_CONNECTION|NetworkError/i.test(resolvedError.message);
        if (isNetworkError) {
          lastError = resolvedError;
          continue;
        }
        throw resolvedError;
      }
    }

    if (lastError) {
      throw new Error('AI API недоступен. Запустите проект через Vercel dev и проверьте серверные переменные окружения.');
    }

    throw new Error('AI сервис временно недоступен');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI запрос превысил лимит ожидания (30с). Повторите попытку.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function repairJsonWithAi(input: string): Promise<string> {
  const result = await callAiApi<RepairJsonResponse>('repair-json', { input });
  return result.fixedJson;
}

export async function fillDescriptionsWithAi(payload: {
  sectionType: 'request' | 'response' | 'generic';
  rows: Array<{
    field: string;
    type: string;
    required: string;
    example: string;
    source?: string;
  }>;
}): Promise<DescriptionSuggestion[]> {
  const result = await callAiApi<FillDescriptionsResponse>('fill-descriptions', payload);
  return result.descriptions;
}

export async function suggestMappingsWithAi(payload: {
  serverFields: string[];
  clientFields: string[];
}): Promise<MappingSuggestion[]> {
  const result = await callAiApi<SuggestMappingsResponse>('suggest-mappings', payload);
  return result.mappings;
}

export async function suggestMaskFieldsWithAi(payload: {
  sectionType: 'request' | 'response' | 'generic';
  rows: Array<{
    field: string;
    type: string;
    description: string;
    example: string;
    source?: string;
  }>;
}): Promise<MaskFieldSuggestion[]> {
  const result = await callAiApi<MaskFieldsResponse>('mask-fields', payload);
  return result.fields;
}
