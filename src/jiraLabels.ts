export const JIRA_LABELS = [
  { key: 'regulatory', description: 'Регуляторная задача', role: 'Основной' },
  { key: 'business', description: 'Задача от бизнеса', role: 'Основной' },
  { key: 'cbs', description: 'Связана с core banking system', role: 'Основной' },
  { key: 'improvement', description: 'Улучшение существующего функционала', role: 'Основной' },
  { key: 'qaa', description: 'Подходит под автоматизированные тесты', role: 'Дополнительный' },
  { key: 'prd', description: 'Обнаружение и исправление действующего функционала на проде', role: 'Основной / дополнительный' },
  { key: 'tst', description: 'Обнаружение и исправление действующего функционала на тесте', role: 'Основной / дополнительный' },
  { key: 'platform', description: 'Платформенное решение команды интеграции', role: 'Основной / дополнительный' },
  { key: 'hotfix', description: 'Должно идти по флоу хотфикса', role: 'Основной / дополнительный' },
  { key: 'technical_debt', description: 'Технический долг реализованного функционала', role: 'Основной / дополнительный' },
  { key: 'hold', description: 'Работы приостановлены', role: 'Дополнительный' },
  { key: 'automation', description: 'Автоматизированный тест-кейс, для типа Тест', role: 'Основной / дополнительный' },
  { key: 'playwright', description: 'Использован Playwright, для типа Тест', role: 'Дополнительный' },
  { key: 'bss_corp', description: 'Связана с ДБО ЮЛ (BSS)', role: 'Дополнительный' }
] as const;

export const JIRA_PRIORITY_RULES: Record<string, readonly string[]> = {
  regulatory: ['Critical', 'Highest', 'High', 'Medium'], cbs: ['Critical', 'Highest', 'High'],
  business: ['Highest', 'High', 'Medium', 'Low'], improvement: ['High', 'Medium', 'Low'],
  platform: ['Critical', 'Highest', 'High', 'Medium', 'Low']
};

export function jiraDescription(ru: string, en: string, uz: string): string { return [ru.trim(), en.trim(), uz.trim()].join('\n\n'); }
