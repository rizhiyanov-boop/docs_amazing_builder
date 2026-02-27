import type { DocSection, ParsedSection, TextSection } from './types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderTextSection(section: TextSection): string {
  if (!section.enabled) {
    return `<h2>${escapeHtml(section.title)}</h2><p><em>Не используется</em></p>`;
  }
  const content = section.value.trim() ? escapeHtml(section.value) : '<em>Не заполнено</em>';
  return `<h2>${escapeHtml(section.title)}</h2><p>${content}</p>`;
}

function renderParsedSection(section: ParsedSection): string {
  if (!section.enabled) {
    return `<h2>${escapeHtml(section.title)}</h2><p><em>Не используется</em></p>`;
  }

  if (section.error) {
    return `<h2>${escapeHtml(section.title)}</h2><p><strong>Секция заблокирована:</strong> ${escapeHtml(section.error)}</p>`;
  }

  const rows = section.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.field)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.required)}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.example)}</td></tr>`
    )
    .join('');

  return `<h2>${escapeHtml(section.title)}</h2><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Поле</th><th>Тип</th><th>Обязательность</th><th>Описание</th><th>Пример</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderHtmlDocument(sections: DocSection[]): string {
  const blocks = sections.map((section) => {
    if (section.kind === 'text') {
      return renderTextSection(section);
    }
    return renderParsedSection(section);
  });

  return ['<!doctype html>', '<html><body>', '<h1>Документация API</h1>', ...blocks, '</body></html>'].join('\n');
}
