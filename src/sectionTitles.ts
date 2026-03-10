import type { DocSection } from './types';

export const DEFAULT_SECTION_TITLE = 'Новая секция';

export function resolveSectionTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || DEFAULT_SECTION_TITLE;
}

export function sanitizeSections(sections: DocSection[]): DocSection[] {
  return sections.map((section) => ({
    ...section,
    title: resolveSectionTitle(section.title)
  }));
}
