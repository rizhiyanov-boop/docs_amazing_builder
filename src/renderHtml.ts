import { resolveSectionTitle } from './sectionTitles';
import { getThemeTokens } from './theme';
import type { ThemeName } from './theme';
import type { DocSection, ParsedSection, TextSection } from './types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function shouldRenderTextSection(section: TextSection): boolean {
  return section.enabled && Boolean(section.value.trim());
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  return section.enabled && (Boolean(section.error) || section.rows.length > 0);
}

function renderTextSection(section: TextSection): string {
  const title = resolveSectionTitle(section.title);
  const content = escapeHtml(section.value.trim());
  return `<h2>${escapeHtml(title)}</h2><p>${content}</p>`;
}

function renderParsedSection(section: ParsedSection): string {
  const title = resolveSectionTitle(section.title);

  if (section.error) {
    return `<h2>${escapeHtml(title)}</h2><p><strong>Секция заблокирована:</strong> ${escapeHtml(section.error)}</p>`;
  }

  const rows = section.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.field)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.required)}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.example)}</td></tr>`
    )
    .join('');

  return `<h2>${escapeHtml(title)}</h2><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Поле</th><th>Тип</th><th>Обязательность</th><th>Описание</th><th>Пример</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderHtmlDocument(sections: DocSection[], theme: ThemeName = 'dark'): string {
  const blocks = sections.flatMap((section) => {
    if (section.kind === 'text') {
      return shouldRenderTextSection(section) ? [renderTextSection(section)] : [];
    }

    return shouldRenderParsedSection(section) ? [renderParsedSection(section)] : [];
  });

  const tokens = getThemeTokens(theme);

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8" />',
    `<style>
      body { margin: 0; padding: 16px; font-family: Inter, system-ui, sans-serif; background: ${tokens.previewBg}; color: ${tokens.previewText}; }
      h1, h2 { margin: 0 0 12px; }
      p { margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { border: 1px solid ${tokens.previewBorder}; padding: 8px; text-align: left; vertical-align: top; }
      th { background: ${tokens.previewTableHead}; }
      html, body { scrollbar-width: thin; scrollbar-color: ${tokens.scrollbarThumb} ${tokens.scrollbarTrack}; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: ${tokens.scrollbarTrack}; }
      ::-webkit-scrollbar-thumb { background: ${tokens.scrollbarThumb}; border-radius: 8px; border: 2px solid ${tokens.scrollbarTrack}; }
      ::-webkit-scrollbar-thumb:hover { background: ${tokens.scrollbarThumbHover}; }
    </style>`,
    '</head>',
    '<body>',
    '<h1>Документация API</h1>',
    ...blocks,
    '</body>',
    '</html>'
  ].join('\n');
}
