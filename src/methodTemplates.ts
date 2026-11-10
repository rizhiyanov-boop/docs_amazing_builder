import type { DocSection, MethodDocument } from './types';

export const methodTemplateAiTasks = [
  'fill-descriptions', 'generate-examples', 'suggest-mappings', 'mask-fields', 'build-validation-rules'
] as const;
export type MethodTemplateAiTask = typeof methodTemplateAiTasks[number];

type MethodTemplate = {
  label: string;
  description: string;
  clientContract: boolean;
  initialErrorCodes: readonly string[];
  aiInstructions: Partial<Record<MethodTemplateAiTask, string>>;
  validate?: (method: Pick<MethodDocument, 'sections' | 'externalUrl'>) => string | undefined;
};

export const methodTemplates = {
  simple: {
    label: 'Простой метод',
    description: 'Один контракт для запроса и ответа',
    clientContract: false,
    initialErrorCodes: [],
    aiInstructions: {
      'fill-descriptions': 'Описывай поля публичного контракта метода.',
      'generate-examples': 'Подбирай значения для публичного контракта метода.'
    }
  },
  orchestration: {
    label: 'Оркестрация',
    description: 'Контракты Server и Client с маппингом полей',
    clientContract: true,
    initialErrorCodes: [],
    aiInstructions: {
      'fill-descriptions': 'Описывай поля публичного контракта Server. Учитывай только переданные поля.',
      'generate-examples': 'Подбирай значения для контракта Server. Учитывай только переданные поля.',
      'suggest-mappings': 'Сопоставляй поля Server и Client по смыслу. Пропускай связи, для которых не хватает данных.'
    }
  }
} satisfies Record<string, MethodTemplate>;

export type MethodTemplateId = keyof typeof methodTemplates;
export const methodTemplateIds = Object.keys(methodTemplates) as MethodTemplateId[];

export function isMethodTemplateId(value: unknown): value is MethodTemplateId {
  return typeof value === 'string' && Object.hasOwn(methodTemplates, value);
}

export function getMethodTemplate(id: MethodTemplateId | undefined): MethodTemplate | undefined {
  return id ? methodTemplates[id] : undefined;
}

export function methodTemplateExternalUrl(method: MethodDocument): string | undefined {
  if (!method.templateId) return method.externalUrl;
  if (!getMethodTemplate(method.templateId)?.clientContract) return '';
  const request = method.sections.find(section => section.kind === 'parsed' && section.sectionType === 'request');
  return (request?.kind === 'parsed' && request.externalRequestUrl?.trim()) || method.externalUrl?.trim() || '';
}

/** Derive the section-level input still used by the editor and renderers. */
export function sectionsForMethodTemplate(sections: DocSection[], id: MethodTemplateId | undefined): DocSection[] {
  const template = getMethodTemplate(id);
  if (!template) return sections;
  return sections.map(section => {
    if (section.kind !== 'parsed' || (section.sectionType !== 'request' && section.sectionType !== 'response')) return section;
    return { ...section, domainModelEnabled: template.clientContract };
  });
}

/** Persist the template ID as the single source of the contract mode. */
export function methodTemplateSectionsForStorage(sections: DocSection[], id: MethodTemplateId | undefined): DocSection[] {
  if (!id) return sections;
  return sections.map(section => {
    if (section.kind !== 'parsed' || (section.sectionType !== 'request' && section.sectionType !== 'response')) return section;
    const stored = { ...section };
    delete stored.domainModelEnabled;
    return stored;
  });
}

export function methodTemplateConflict(method: Pick<MethodDocument, 'sections' | 'externalUrl'>, id: MethodTemplateId): string | undefined {
  const template = getMethodTemplate(id);
  if (template?.clientContract !== false) return template?.validate?.(method);
  const hasClientData = method.externalUrl?.trim() || method.sections.some(section => {
    if (section.kind === 'errors') return section.rows.some(row =>
      [row.clientHttpStatus, row.clientResponse, row.clientResponseCode].some(value => value?.trim() && value.trim() !== '-'));
    if (section.kind !== 'parsed') return false;
    return Boolean(section.clientRows?.some(row => row.field?.trim()) || Object.keys(section.clientMappings ?? {}).length
      || section.clientInput?.trim() || section.clientSchemaInput?.trim() || section.externalRequestUrl?.trim()
      || (section.externalAuthType && section.externalAuthType !== 'none'));
  });
  if (hasClientData) return 'В документе есть данные Client. Для них нужен шаблон с контрактом Client';
  return template.validate?.(method);
}

export function suggestMethodTemplate(method: Pick<MethodDocument, 'sections' | 'externalUrl'>): MethodTemplateId {
  return methodTemplateConflict(method, 'simple') ? 'orchestration' : 'simple';
}
