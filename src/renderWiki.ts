import { getRequestColumnLabel, getRequestColumnOrder } from './requestColumns';
import { getRequestAuthInfo, getRequestRows, requestHasRows, splitRequestRows } from './requestHeaders';
import { resolveSectionTitle } from './sectionTitles';
import type { DocSection, ParsedRow, ParsedSection, TextSection } from './types';

const EMPTY_WIKI_CELL = '&#160;';

function escapeWiki(value: string): string {
  return value.replaceAll('|', '&#124;');
}

function isDualModelSection(section: ParsedSection): boolean {
  return section.id === 'request' || section.id === 'response';
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

function toWikiTextBlock(value: string): string[] {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => escapeWiki(line));
}

function shouldRenderTextSection(section: TextSection): boolean {
  return section.enabled && Boolean(section.value.trim());
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  if (!section.enabled) return false;
  if (isDualModelSection(section)) return Boolean(section.error) || Boolean(section.clientError) || requestHasRows(section);
  return Boolean(section.error) || section.rows.length > 0;
}

function renderDefaultTable(rows: ParsedRow[]): string[] {
  const lines = ['||Поле||Тип||Обязательность||Описание||Пример||'];
  for (const row of rows) {
    const cells = [toWikiCell(row.field), toWikiCell(row.type), toWikiCell(row.required), toWikiCell(row.description), toWikiExampleCell(row.example)];
    lines.push(`|${cells.join('|')}|`);
  }
  return lines;
}

function renderStructuredTable(rows: ParsedRow[], section: ParsedSection): string[] {
  const columns = getRequestColumnOrder(section, rows);
  const headerCells = columns.map((column) => getRequestColumnLabel(section, column));
  const lines = [`||${headerCells.join('||')}||`];

  for (const row of rows) {
    const cellMap = {
      field: row.field,
      clientField: row.clientField ?? '',
      type: row.type,
      required: row.required,
      description: row.description,
      example: row.example
    };

    const cells = columns.map((column) => {
      const value = cellMap[column];
      if (column === 'example') return toWikiExampleCell(value);
      return toWikiCell(value);
    });

    lines.push(`|${cells.join('|')}|`);
  }

  return lines;
}

function renderTextSection(section: TextSection): string[] {
  return [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`, '', ...toWikiTextBlock(section.value)];
}

function renderRequestSection(section: ParsedSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];
  const { headers, otherRows, urlRow } = splitRequestRows(getRequestRows(section));
  const requestError = section.error || section.clientError;
  const authInfo = getRequestAuthInfo(section);
  const requestUrl = section.requestUrl?.trim() || (urlRow?.example ?? '');
  const requestMethod = section.requestMethod?.trim() || section.format.toUpperCase();
  const requestProtocol = section.requestProtocol?.trim() || 'REST';

  lines.push('');
  lines.push('h3. Общее описание метода');
  lines.push('');
  if (requestUrl) {
    lines.push(`*URL:* ${toWikiCell(requestUrl)}`);
  }
  lines.push(`*Метод:* ${toWikiCell(requestMethod)}`);
  lines.push(`*Протокол:* ${toWikiCell(requestProtocol)}`);

  if (authInfo) {
    lines.push('');
    lines.push('h3. Authorization');
    lines.push('');
    for (const detail of authInfo.details) {
      lines.push(`*${escapeWiki(detail.label)}:* ${toWikiCell(detail.value)}`);
    }
  }
  if (headers.length > 0) {
    lines.push('');
    lines.push('h3. Headers');
    lines.push('');
    lines.push(...renderStructuredTable(headers, section));
  }
  if (requestError) {
    lines.push('');
    lines.push(`*Секция заблокирована:* ${toWikiCell(requestError)}`);
  } else if (otherRows.length > 0) {
    lines.push('');
    lines.push('h3. Параметры');
    lines.push('');
    lines.push(...renderStructuredTable(otherRows, section));
  }

  return lines;
}
function renderResponseSection(section: ParsedSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (section.error || section.clientError) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error || section.clientError || '')}`);
    return lines;
  }

  lines.push(...renderStructuredTable(getRequestRows(section), section));
  return lines;
}

function renderParsedSection(section: ParsedSection): string[] {
  if (section.id === 'request') return renderRequestSection(section);
  if (section.id === 'response') return renderResponseSection(section);

  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (section.error) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error)}`);
    return lines;
  }

  lines.push(...renderDefaultTable(section.rows));
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
