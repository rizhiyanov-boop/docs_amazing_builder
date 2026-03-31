import type { DocSection, ErrorsSection, ParsedSection } from '../types';

export type OnboardingStepId = 'choose-entry' | 'prepare-source' | 'run-parse' | 'refine-structure' | 'export-docs';

export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  title: string;
  description: string;
}

export interface OnboardingProgressContext {
  hasSourceInput: boolean;
  hasParsedRows: boolean;
  hasStructuredContent: boolean;
  hasExportedDocs: boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    id: 'choose-entry',
    title: 'Выбор сценария',
    description: 'Выберите быстрый старт, пустой проект или импорт JSON.'
  },
  {
    id: 'prepare-source',
    title: 'Подготовьте источник',
    description: 'Вставьте cURL или JSON в блок request/response.'
  },
  {
    id: 'run-parse',
    title: 'Запустите парсер',
    description: 'Преобразуйте исходник в строки таблиц.'
  },
  {
    id: 'refine-structure',
    title: 'Заполните структуру',
    description: 'Добавьте описания в текст, диаграммы или блок ошибок.'
  },
  {
    id: 'export-docs',
    title: 'Сделайте экспорт',
    description: 'Скачайте документацию в нужном формате.'
  }
] as const;

function isParsedSection(section: DocSection): section is ParsedSection {
  return section.kind === 'parsed';
}

function hasMeaningfulErrorsContent(section: ErrorsSection): boolean {
  return section.rows.some((row) =>
    Boolean(
      row.clientHttpStatus.trim() ||
      row.clientResponse.trim() ||
      row.trigger.trim() ||
      row.serverHttpStatus.trim() ||
      row.internalCode.trim() ||
      row.message.trim() ||
      row.errorType !== '-'
    )
  );
}

export function evaluateOnboardingProgress(sections: DocSection[], hasExportedDocs: boolean): OnboardingProgressContext {
  const parsedSections = sections.filter(isParsedSection);

  const hasSourceInput = parsedSections.some((section) => {
    const serverInput = section.input.trim().length > 0;
    const clientInput = (section.clientInput ?? '').trim().length > 0;
    return serverInput || clientInput;
  });

  const hasParsedRows = parsedSections.some((section) => {
    const serverRows = section.rows.length > 0;
    const clientRows = (section.clientRows ?? []).length > 0;
    return serverRows || clientRows;
  });

  const hasStructuredContent = sections.some((section) => {
    if (section.kind === 'text') return section.value.trim().length > 0;
    if (section.kind === 'diagram') {
      return section.diagrams.some((diagram) => Boolean(diagram.code.trim() || diagram.description?.trim() || diagram.title.trim()));
    }
    if (section.kind === 'errors') return hasMeaningfulErrorsContent(section);
    return false;
  });

  return {
    hasSourceInput,
    hasParsedRows,
    hasStructuredContent,
    hasExportedDocs
  };
}

export function resolveOnboardingStep(context: OnboardingProgressContext): OnboardingStepId {
  if (!context.hasSourceInput) return 'prepare-source';
  if (!context.hasParsedRows) return 'run-parse';
  if (!context.hasStructuredContent) return 'refine-structure';
  return 'export-docs';
}

export function isOnboardingStepId(value: string): value is OnboardingStepId {
  return ONBOARDING_STEPS.some((step) => step.id === value);
}