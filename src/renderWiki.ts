import type { DocSection, ParsedSection, TextSection } from './types';

function escapeWiki(value: string): string {
  // Only escape pipe for table safety
  return value.replaceAll('|', '&#124;');
}

function toWikiCell(value: string): string {
  // Remove excessive whitespace, normalize newlines
  return escapeWiki(value)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\t', ' ')
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('<br/>');
}

function toWikiExampleCell(value: string): string {
  // If looks like JSON/array or too long, wrap in {noformat}
  const trimmed = value.trim();
  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (looksLikeJson) {
    // Wrap explicit JSON with {json} for Confluence
    return `{json}${escapeWiki(trimmed)}{json}`;
  }
  return toWikiCell(trimmed);
}

function toWikiDescriptionCell(value: string): string {
  const trimmed = value.trim();
  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (looksLikeJson) {
    return `{json}${escapeWiki(trimmed)}{json}`;
  }
  return toWikiCell(trimmed);
}

function renderTextSection(section: TextSection): string[] {
  const lines: string[] = [];
  lines.push(`h2. ${escapeWiki(section.title)}`);

  if (!section.enabled) {
    lines.push('_Не используется_');
    return lines;
  }

  lines.push(section.value.trim() ? toWikiCell(section.value) : '_Не заполнено_');
  return lines;
}

function renderParsedSection(section: ParsedSection): string[] {
  const lines: string[] = [];
  lines.push(`h2. ${escapeWiki(section.title)}`);

  if (!section.enabled) {
    lines.push('_Не используется_');
    return lines;
  }

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
    lines.push('');
    if (section.kind === 'text') {
      lines.push(...renderTextSection(section));
    } else {
      lines.push(...renderParsedSection(section));
    }
  }
  return lines.join('\n');
}
