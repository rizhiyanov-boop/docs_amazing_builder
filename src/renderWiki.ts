import { getRequestRows, splitRequestRows } from './requestHeaders';
import { resolveSectionTitle } from './sectionTitles';
import type { DocSection, ParsedRow, ParsedSection, TextSection } from './types';

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

  if (!trimmed) return EMPTY_WIKI_CELL;
  if (looksLikeJson) return `{json}${escapeWiki(trimmed)}{json}`;
  return toWikiCell(trimmed);
}

function shouldRenderTextSection(section: TextSection): boolean {
  return section.enabled && Boolean(section.value.trim());
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  if (!section.enabled) return false;
  if (section.id === 'request') return Boolean(section.error) || getRequestRows(section).length > 0;
  return Boolean(section.error) || section.rows.length > 0;
}

function renderTable(rows: ParsedRow[]): string[] {
  const lines = ['||Поле||Тип||Обязательность||Описание||Пример||'];
  for (const row of rows) {
    lines.push(
      `|${toWikiCell(row.field)}|${toWikiCell(row.type)}|${toWikiCell(row.required)}|${toWikiCell(row.description)}|${toWikiExampleCell(row.example)}|`
    );
  }
  return lines;
}

function renderTextSection(section: TextSection): string[] {
  return [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`, toWikiCell(section.value)];
}

function renderRequestSection(section: ParsedSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];
  const { headers, otherRows, urlRow } = splitRequestRows(getRequestRows(section));

  if (urlRow) {
    lines.push(`*URL:* ${toWikiCell(urlRow.example)}`);
  }
  if (headers.length > 0) {
    lines.push('h3. Headers');
    lines.push(...renderTable(headers));
  }
  if (section.error) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error)}`);
  } else if (otherRows.length > 0) {
    lines.push('h3. Параметры');
    lines.push(...renderTable(otherRows));
  }

  return lines;
}

function renderParsedSection(section: ParsedSection): string[] {
  if (section.id === 'request') {
    return renderRequestSection(section);
  }

  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (section.error) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error)}`);
    return lines;
  }

  lines.push(...renderTable(section.rows));
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
