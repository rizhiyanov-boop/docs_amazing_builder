import type { DocSection } from './types';
import { DEFAULT_REQUEST_COLUMN_ORDER } from './requestColumns';

export const DEFAULT_SECTION_TITLE = 'Новая секция';

export function resolveSectionTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || DEFAULT_SECTION_TITLE;
}

export function sanitizeSections(sections: DocSection[]): DocSection[] {
  return sections.map((section) => {
    if (section.kind !== 'parsed' || section.id !== 'request') {
      return {
        ...section,
        title: resolveSectionTitle(section.title)
      };
    }

    return {
      ...section,
      title: resolveSectionTitle(section.title),
      domainModelEnabled: section.domainModelEnabled ?? false,
      clientFormat: section.clientFormat ?? 'json',
      clientInput: section.clientInput ?? '',
      clientRows: section.clientRows ?? [],
      clientError: section.clientError ?? '',
      clientMappings: section.clientMappings ?? {},
      requestColumnOrder: section.requestColumnOrder ?? DEFAULT_REQUEST_COLUMN_ORDER
    };
  });
}
