export const DEFAULT_OPENAI_MODEL = 'gpt-6-luna';

export function resolveOpenAiModel(configuredModel?: string): string {
  return configuredModel?.trim() || DEFAULT_OPENAI_MODEL;
}

export function openAiCompletionOptions(configuredModel: string | undefined, maxOutputTokens: number) {
  const model = resolveOpenAiModel(configuredModel);
  const options = { model, max_completion_tokens: maxOutputTokens };
  if (model === 'gpt-6-luna' || model === 'gpt-6-sol') {
    return { ...options, reasoning_effort: 'none' as const, temperature: 0.1 };
  }
  if (model === 'gpt-6-astra' || model === 'gpt-6.1-sol') {
    return { ...options, reasoning_effort: 'low' as const };
  }
  return { ...options, temperature: 0.1 };
}
