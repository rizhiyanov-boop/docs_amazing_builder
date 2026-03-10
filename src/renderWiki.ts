import { resolveSectionTitle } from './sectionTitles';
import type { DocSection, ParsedSection, TextSection } from './types';

const EMPTY_WIKI_CELL = '&#160;';

function escapeWiki(value: string): string {
  return value.replaceAll('|', '&#124;');
}

function toWikiCell(value: string): string {
  const normalized = escapeWiki(value)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\t', ' ')
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('<br/>');

  return normalized || EMPTY_WIKI_CELL;
}

function toWikiExampleCell(value: string): string {
  const trimmed = value.trim();
  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (!trimmed) {
    return EMPTY_WIKI_CELL;
  }

  if (looksLikeJson) {
    return `{json}${escapeWiki(trimmed)}{json}`;
  }

  return toWikiCell(trimmed);
}

function toWikiDescriptionCell(value: string): string {
  const trimmed = value.trim();
  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (!trimmed) {
    return EMPTY_WIKI_CELL;
  }

  if (looksLikeJson) {
    return `{json}${escapeWiki(trimmed)}{json}`;
  }

  return toWikiCell(trimmed);
}

function shouldRenderTextSection(section: TextSection): boolean {
  return section.enabled && Boolean(section.value.trim());
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  return section.enabled && (Boolean(section.error) || section.rows.length > 0);
}

function renderTextSection(section: TextSection): string[] {
  return [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`, toWikiCell(section.value)];
}

function renderParsedSection(section: ParsedSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (section.error) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error)}`);
    return lines;
  }

  lines.push('||Поле||Тип||Обязательность||Описание||Пример||');
  for (const row of section.rows) {
    lines.push(
      `|${toWikiCell(row.field)}|${toWikiCell(row.type)}|${toWikiCell(row.required)}|${toWikiDescriptionCell(row.description)}|${toWikiExampleCell(row.example)}|`
    );
  }

  return lines;
}

export function renderWikiDocument(sections: DocSection[]): string {
  const lines: string[] = ['h1. Документация API'];

  for (const section of sections) {
    const rendered =
      section.kind === 'text'
        ? shouldRenderTextSection(section)
          ? renderTextSection(section)
          : []
        : shouldRenderParsedSection(section)
          ? renderParsedSection(section)
          : [];

    if (rendered.length > 0) {
      lines.push('');
      lines.push(...rendered);
    }
  }

  return lines.join('\n');
}
