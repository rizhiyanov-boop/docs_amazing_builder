import { getRequestColumnLabel, getRequestColumnOrder } from './requestColumns';
import { getRequestAuthInfo, getRequestHeaderRows, getRequestRows, requestHasRows, splitRequestRows } from './requestHeaders';
import { richTextToHtml } from './richText';
import { resolveSectionTitle } from './sectionTitles';
import { buildInputFromRows } from './sourceSync';
import { getThemeTokens } from './theme';
import { getDiagramImageUrl } from './diagramUtils';
import type { ThemeName } from './theme';
import type { DiagramSection, DocSection, ErrorsSection, ParseFormat, ParsedRow, ParsedSection, TextSection } from './types';

type RenderHtmlOptions = {
  interactive?: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isDualModelSection(section: ParsedSection): boolean {
  return section.sectionType === 'request' || section.sectionType === 'response';
}

function shouldRenderTextSection(section: TextSection): boolean {
  return section.enabled && Boolean(section.value.trim());
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  if (!section.enabled) return false;
  if (isDualModelSection(section)) return Boolean(section.error) || Boolean(section.clientError) || requestHasRows(section);
  return Boolean(section.error) || section.rows.length > 0;
}

function shouldRenderDiagramSection(section: DiagramSection): boolean {
  if (!section.enabled) return false;
  return section.diagrams.some((diagram) => diagram.code.trim());
}

function shouldRenderErrorsSection(section: ErrorsSection): boolean {
  return section.enabled && section.rows.length > 0;
}

function renderCell(value: string): string {
  return escapeHtml(value.trim()) || '&mdash;';
}

function renderTextValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '<span class="muted">Не заполнено</span>';
  return escapeHtml(trimmed).replaceAll('\n', '<br/>');
}

function wrapCodeToken(kind: string, value: string): string {
  return `<span class="code-token ${kind}">${escapeHtml(value)}</span>`;
}

function highlightJsonCode(value: string): string {
  let index = 0;
  let result = '';

  while (index < value.length) {
    const char = value[index];

    if (char === '"') {
      let end = index + 1;
      let escaped = false;
      while (end < value.length) {
        const current = value[end];
        if (current === '"' && !escaped) break;
        escaped = current === '\\' && !escaped;
        if (current !== '\\') escaped = false;
        end += 1;
      }

      const token = value.slice(index, Math.min(end + 1, value.length));
      let lookahead = end + 1;
      while (lookahead < value.length && /\s/.test(value[lookahead])) lookahead += 1;
      const kind = value[lookahead] === ':' ? 'code-key' : 'code-string';
      result += wrapCodeToken(kind, token);
      index = Math.min(end + 1, value.length);
      continue;
    }

    if ('{}[]:,'.includes(char)) {
      result += wrapCodeToken('code-punctuation', char);
      index += 1;
      continue;
    }

    const literalMatch = value.slice(index).match(/^(true|false|null)\b/);
    if (literalMatch) {
      const token = literalMatch[1];
      result += wrapCodeToken(token === 'null' ? 'code-null' : 'code-boolean', token);
      index += token.length;
      continue;
    }

    const numberMatch = value.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      result += wrapCodeToken('code-number', numberMatch[0]);
      index += numberMatch[0].length;
      continue;
    }

    result += escapeHtml(char);
    index += 1;
  }

  return result;
}

function highlightCurlCode(value: string): string {
  return escapeHtml(value)
    .replace(/\b(curl)\b/g, '<span class="code-token code-keyword">$1</span>')
    .replace(/(^|\s)(--?[A-Za-z-]+)/g, '$1<span class="code-token code-flag">$2</span>')
    .replace(/(&quot;https?:\/\/.*?&quot;)/g, '<span class="code-token code-url">$1</span>')
    .replace(/(&quot;.*?&quot;|'.*?')/g, '<span class="code-token code-string">$1</span>');
}

function highlightCode(format: ParseFormat, value: string): string {
  if (format === 'json') return highlightJsonCode(value);
  return highlightCurlCode(value);
}

function renderProseValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '<span class="muted">Не заполнено</span>';
  return richTextToHtml(trimmed).replace(/<h([2-6])>/g, '<h$1 class="prose-heading">');
}

function renderTag(label: string, kind = ''): string {
  return `<span class="tag ${kind}">${escapeHtml(label)}</span>`;
}

function renderButton(label: string, href: string, kind = 'ghost', interactive = true): string {
  if (!interactive) return `<span class="doc-btn ${kind} disabled">${escapeHtml(label)}</span>`;
  return `<a class="doc-btn ${kind}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderUrl(value: string, label = 'URL', interactive = true): string {
  if (!value.trim()) return '';
  const action = interactive
    ? `<button class="smallbtn" type="button" data-copy-text="${escapeHtml(value)}">Copy</button>`
    : '';
  return `<div class="url"><span>${escapeHtml(label)}: ${escapeHtml(value)}</span>${action}</div>`;
}

function renderCodeBlock(id: string, title: string, content: string, interactive = true, format: ParseFormat = 'json'): string {
  if (!content.trim()) return '';
  return [
    '<details open>',
    `<summary>${escapeHtml(title)} <span class="sumhint">example</span></summary>`,
    `<pre>${
      interactive
        ? `<div class="pretools"><button class="smallbtn" type="button" data-copy-target="${escapeHtml(id)}">Copy</button></div>`
        : ''
    }<code class="code-block language-${format}" id="${escapeHtml(id)}">${highlightCode(format, content.trim())}</code></pre>`,
    '</details>'
  ].join('');
}

function renderDefaultTable(rows: ParsedRow[]): string {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${renderCell(row.field)}</td><td>${renderCell(row.type)}</td><td>${renderCell(row.required)}</td><td>${renderCell(row.description)}</td><td>${renderCell(row.example)}</td></tr>`
    )
    .join('');

  return `<table><thead><tr><th>Поле</th><th>Тип</th><th>Обязательность</th><th>Описание</th><th>Пример</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderStructuredTable(rows: ParsedRow[], section: ParsedSection): string {
  const columns = getRequestColumnOrder(section, rows);
  const header = columns.map((column) => `<th>${escapeHtml(getRequestColumnLabel(section, column))}</th>`).join('');
  const body = rows
    .map((row) => {
      const cellMap = {
        field: row.field || '—',
        clientField: row.clientField || '—',
        type: row.type || '—',
        required: row.required || '—',
        description: row.description || '—',
        example: row.example || '—'
      };

      return `<tr>${columns.map((column) => `<td>${renderCell(cellMap[column])}</td>`).join('')}</tr>`;
    })
    .join('');

  return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function wrapCard(id: string, title: string, meta: string, body: string, path = '', method = '', interactive = true): string {
  return [
    `<section class="card" id="${escapeHtml(id)}">`,
    '<div class="cardhead">',
    '<div class="methodtitle">',
    `<h2>${escapeHtml(title)}</h2>`,
    meta ? `<div class="methodmeta">${meta}</div>` : '',
    '</div>',
    path ? `<div>${renderUrl(path, method || 'Path', interactive)}</div>` : '<div></div>',
    '</div>',
    `<div class="section">${body}</div>`,
    '</section>'
  ].join('');
}

function renderTextSection(section: TextSection): string {
  const title = resolveSectionTitle(section.title);
  return wrapCard(section.id, title, '', `<div class="section-text">${renderProseValue(section.value)}</div>`);
}

function renderInfoNote(label: string, value: string): string {
  if (!value.trim()) return '';
  return `<div class="note"><b>${escapeHtml(label)}</b><br/>${renderTextValue(value)}</div>`;
}

function renderAuthDetails(section: ParsedSection): string {
  const authInfo = getRequestAuthInfo(section);
  if (!authInfo) return '';

  return [
    '<details open>',
    `<summary>Authorization <span class="sumhint">${escapeHtml(authInfo.schemeLabel)}</span></summary>`,
    '<table>',
    '<thead><tr><th>Параметр</th><th>Значение</th></tr></thead>',
    '<tbody>',
    ...authInfo.details.map((detail) => `<tr><td>${escapeHtml(detail.label)}</td><td>${renderCell(detail.value)}</td></tr>`),
    '</tbody>',
    '</table>',
    '</details>'
  ].join('');
}

function renderRequestSection(section: ParsedSection, interactive = true): string {
  const title = resolveSectionTitle(section.title);
  const requestRows = getRequestRows(section);
  const { headers, otherRows, urlRow } = splitRequestRows(requestRows);
  const requestError = section.error || section.clientError;
  const requestUrl = section.requestUrl?.trim() || (urlRow?.example ?? '');
  const requestMethod = section.requestMethod?.trim() || section.format.toUpperCase();
  const requestProtocol = section.requestProtocol?.trim() || 'REST';
  const externalRequestUrl = section.externalRequestUrl?.trim() || '';
  const externalRequestMethod = section.externalRequestMethod?.trim() || 'POST';
  const externalAuthHeader =
    section.externalAuthType === 'bearer'
      ? [{ field: 'Authorization', type: 'string', required: '+', description: 'Авторизация: Bearer token', example: `Bearer ${section.externalAuthTokenExample?.trim() || 'token'}` }]
      : section.externalAuthType === 'basic'
        ? [{ field: 'Authorization', type: 'string', required: '+', description: 'Авторизация: Basic auth', example: 'Basic <base64(username:password)>' }]
        : section.externalAuthType === 'api-key'
          ? [{
              field: section.externalAuthHeaderName?.trim() || 'X-API-Key',
              type: 'string',
              required: '+',
              description: 'Авторизация: API key',
              example: section.externalAuthApiKeyExample?.trim() || ''
            }]
          : [];
  const externalHeaders = [
    ...externalAuthHeader.map((row) => ({ ...row, source: 'header' as const })),
    ...(section.clientRows ?? []).filter((row) => row.source === 'header' && row.enabled !== false)
  ];
  const serverCurl = buildInputFromRows(
    'curl',
    [...getRequestHeaderRows(section).filter((row) => row.enabled !== false), ...section.rows.filter((row) => row.source !== 'header')],
    { requestUrl, requestMethod: section.requestMethod }
  );
  const clientCurl =
    section.domainModelEnabled && (section.clientRows?.length ?? 0) > 0
      ? buildInputFromRows('curl', externalHeaders.concat((section.clientRows ?? []).filter((row) => row.source !== 'header')), { requestUrl: externalRequestUrl, requestMethod: section.externalRequestMethod })
      : '';
  const meta = [renderTag(requestMethod), renderTag(requestProtocol), renderTag(section.format.toUpperCase())].join(' ');
  const body = [
    renderInfoNote('Назначение', title),
    `<details open><summary>Общее описание метода <span class="sumhint">${escapeHtml(requestProtocol)}</span></summary><table><tbody><tr><td>URL</td><td>${renderCell(
      requestUrl
    )}</td></tr><tr><td>Метод</td><td>${renderCell(requestMethod)}</td></tr><tr><td>Протокол</td><td>${renderCell(requestProtocol)}</td></tr></tbody></table></details>`,
    renderAuthDetails(section),
    headers.length > 0
      ? `<details open><summary>Headers <span class="sumhint">${headers.length} headers</span></summary>${renderStructuredTable(headers, section)}</details>`
      : '',
    otherRows.length > 0
      ? `<details open><summary>Request schema <span class="sumhint">${section.format.toUpperCase()}</span></summary>${renderStructuredTable(otherRows, section)}</details>`
      : '',
    renderCodeBlock(`${section.id}-server-example`, 'Server request example', section.input, interactive, section.format),
    renderCodeBlock(`${section.id}-server-curl`, 'Server cURL', serverCurl, interactive),
    section.domainModelEnabled
      ? `<details open><summary>Внешний вызов <span class="sumhint">${escapeHtml(requestProtocol)}</span></summary><table><tbody><tr><td>Внешний URL</td><td>${renderCell(
          externalRequestUrl
        )}</td></tr><tr><td>Метод</td><td>${renderCell(externalRequestMethod)}</td></tr><tr><td>Протокол</td><td>${renderCell(requestProtocol)}</td></tr></tbody></table></details>`
      : '',
    section.domainModelEnabled && externalHeaders.length > 0
      ? `<details open><summary>Внешние headers <span class="sumhint">${externalHeaders.length} headers</span></summary>${renderStructuredTable(
          externalHeaders,
          section
        )}</details>`
      : '',
    section.domainModelEnabled
      ? renderCodeBlock(`${section.id}-client-example`, 'Client request example', section.clientInput ?? '', interactive, section.clientFormat ?? 'json')
      : '',
    section.domainModelEnabled ? renderCodeBlock(`${section.id}-client-curl`, 'Client cURL', clientCurl, interactive) : '',
    requestError ? `<div class="note bad"><b>Ошибка секции</b><br/>${escapeHtml(requestError)}</div>` : ''
  ]
    .filter(Boolean)
    .join('');

  return wrapCard(section.id, title, meta, body, requestUrl, requestMethod, interactive);
}

function renderResponseSection(section: ParsedSection, interactive = true): string {
  const title = resolveSectionTitle(section.title);
  const rows = getRequestRows(section);
  const responseError = section.error || section.clientError;
  const meta = renderTag(section.format.toUpperCase());
  const body = [
    renderInfoNote('Назначение', title),
    rows.length > 0
      ? `<details open><summary>Response schema <span class="sumhint">${rows.length} rows</span></summary>${renderStructuredTable(rows, section)}</details>`
      : '',
    renderCodeBlock(`${section.id}-server-example`, 'Server response example', section.input, interactive, section.format),
    section.domainModelEnabled
      ? renderCodeBlock(`${section.id}-client-example`, 'Client response example', section.clientInput ?? '', interactive, section.clientFormat ?? 'json')
      : '',
    responseError ? `<div class="note bad"><b>Ошибка секции</b><br/>${escapeHtml(responseError)}</div>` : ''
  ]
    .filter(Boolean)
    .join('');

  return wrapCard(section.id, title, meta, body, '', '', interactive);
}

function renderGenericParsedSection(section: ParsedSection, interactive = true): string {
  const title = resolveSectionTitle(section.title);
  const meta = renderTag(section.format.toUpperCase());
  const body = [
    `<details open><summary>Schema <span class="sumhint">${section.rows.length} rows</span></summary>${renderDefaultTable(section.rows)}</details>`,
    renderCodeBlock(`${section.id}-example`, `${title} example`, section.input, interactive, section.format),
    section.error ? `<div class="note bad"><b>Ошибка секции</b><br/>${escapeHtml(section.error)}</div>` : ''
  ]
    .filter(Boolean)
    .join('');

  return wrapCard(section.id, title, meta, body, '', '', interactive);
}

function renderParsedSection(section: ParsedSection, interactive = true): string {
  if (section.sectionType === 'request') return renderRequestSection(section, interactive);
  if (section.sectionType === 'response') return renderResponseSection(section, interactive);
  return renderGenericParsedSection(section, interactive);
}

function renderDiagramSection(section: DiagramSection): string {
  const title = resolveSectionTitle(section.title);
  const body = section.diagrams
    .filter((diagram) => diagram.code.trim())
    .map((diagram, index) => {
      const diagramTitle = diagram.title.trim() || `Диаграмма ${index + 1}`;
      const imageUrl = getDiagramImageUrl(diagram.engine, diagram.code, 'jpeg');

      return [
        '<details open>',
        `<summary>${escapeHtml(diagramTitle)} <span class="sumhint">${escapeHtml(diagram.engine.toUpperCase())}</span></summary>`,
        `<div class="section-text"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(diagramTitle)}" style="max-width:100%;border:1px solid var(--border);border-radius:10px;" /></div>`,
        diagram.description?.trim() ? `<div class="note">${renderTextValue(diagram.description)}</div>` : '',
        `<details><summary>Код диаграммы</summary><pre><code>${escapeHtml(diagram.code)}</code></pre></details>`,
        '</details>'
      ]
        .filter(Boolean)
        .join('');
    })
    .join('');

  return wrapCard(section.id, title, renderTag('DIAGRAM'), body);
}

function renderErrorsSection(section: ErrorsSection): string {
  const title = resolveSectionTitle(section.title);
  const bodyRows = section.rows
    .map(
      (row, index) =>
        `<tr><td>${index + 1}</td><td>${renderCell(row.clientHttpStatus)}</td><td>${renderCell(row.clientResponse)}</td><td>${renderCell(row.trigger)}</td><td>${renderCell(row.errorType)}</td><td>${renderCell(row.serverHttpStatus)}</td><td>${renderCell(row.internalCode)}</td><td>${renderCell(row.message)}</td></tr>`
    )
    .join('');

  const body = `<table><thead><tr><th>№</th><th>Client HTTP Status</th><th>Client Response</th><th>Trigger (условия возникновения)</th><th>Error Type</th><th>Server HTTP Status</th><th>Полный internalCode</th><th>Server Response</th></tr></thead><tbody>${bodyRows}</tbody></table>`;
  return wrapCard(section.id, title, renderTag('ERRORS'), body);
}

function getVisibleSections(sections: DocSection[]): DocSection[] {
  return sections.filter((section) => {
    if (section.kind === 'text') return shouldRenderTextSection(section);
    if (section.kind === 'parsed') return shouldRenderParsedSection(section);
    if (section.kind === 'diagram') return shouldRenderDiagramSection(section);
    return shouldRenderErrorsSection(section);
  });
}

function renderSidebar(sections: DocSection[], interactive = true): string {
  const items = sections
    .map((section) => {
      const badge = section.kind === 'parsed' ? `<span class="chip">${escapeHtml(section.format.toUpperCase())}</span>` : '';
      if (!interactive) {
        return `<div class="section-item">${badge}<span class="section-title">${escapeHtml(resolveSectionTitle(section.title))}</span></div>`;
      }
      return `<a class="section-item" data-section-link="${escapeHtml(section.id)}" href="#${escapeHtml(section.id)}">${badge}<span class="section-title">${escapeHtml(
        resolveSectionTitle(section.title)
      )}</span></a>`;
    })
    .join('');

  return [`<aside class="sidebar"><div class="sidebar-head"><strong>Секции</strong></div><div class="section-list">${items}</div></aside>`].join('');
}

export function renderHtmlDocument(sections: DocSection[], theme: ThemeName = 'dark', options: RenderHtmlOptions = {}): string {
  const interactive = options.interactive ?? true;
  const visibleSections = getVisibleSections(sections);
  const blocks = visibleSections.map((section) => {
    if (section.kind === 'text') return renderTextSection(section);
    if (section.kind === 'parsed') return renderParsedSection(section, interactive);
    if (section.kind === 'diagram') return renderDiagramSection(section);
    return renderErrorsSection(section);
  });
  const darkTokens = getThemeTokens('dark');
  const lightTokens = getThemeTokens('light');
  const requestSections = sections.filter(
    (section): section is ParsedSection => section.kind === 'parsed' && section.sectionType === 'request'
  );
  const responseSections = sections.filter(
    (section): section is ParsedSection => section.kind === 'parsed' && section.sectionType === 'response'
  );
  const themeConfig = {
    dark: darkTokens,
    light: lightTokens
  };
  const initialTheme = theme;

  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    '<title>API Integration</title>',
    `<style>
      :root{
        --bg:${themeConfig[initialTheme].bg};
        --panel:${themeConfig[initialTheme].panel};
        --card:${themeConfig[initialTheme].card};
        --text:${themeConfig[initialTheme].previewText};
        --muted:${themeConfig[initialTheme].muted};
        --accent:${themeConfig[initialTheme].accent};
        --accent-solid:${themeConfig[initialTheme].accentSolid};
        --border:${themeConfig[initialTheme].border};
        --shadow:${themeConfig[initialTheme].shadow};
        --input-bg:${themeConfig[initialTheme].inputBg};
        --input-text:${themeConfig[initialTheme].inputText};
        --scrollbar-track:${themeConfig[initialTheme].scrollbarTrack};
        --scrollbar-thumb:${themeConfig[initialTheme].scrollbarThumb};
        --scrollbar-thumb-hover:${themeConfig[initialTheme].scrollbarThumbHover};
        --button-bg:${themeConfig[initialTheme].buttonBg};
        --button-text:${themeConfig[initialTheme].buttonText};
        --button-shadow:${themeConfig[initialTheme].buttonShadow};
        --button-shadow-hover:${themeConfig[initialTheme].buttonShadowHover};
        --active-bg:${themeConfig[initialTheme].activeBg};
        --active-text:${themeConfig[initialTheme].activeText};
        --preview-table-head:${themeConfig[initialTheme].previewTableHead};
        --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      *{box-sizing:border-box}
      html,body{height:100%}
      html, body {
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
      }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: var(--scrollbar-track); }
      ::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb);
        border-radius: 8px;
        border: 2px solid var(--scrollbar-track);
      }
      ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
      body{
        margin:0;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, system-ui, -apple-system, sans-serif;
      }
      body[data-theme="light"]{
        background:
          radial-gradient(circle at top left, rgba(255, 255, 255, 0.9), transparent 32%),
          linear-gradient(180deg, #f8f5ef 0%, #f3efe6 100%);
      }
      a{color:inherit;text-decoration:none}
      .shell{
        min-height:100vh;
        display:flex;
        flex-direction:column;
        gap:16px;
        padding:20px 24px 40px;
      }
      .topbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        background:var(--panel);
        border:1px solid var(--border);
        border-radius:14px;
        padding:14px 16px;
        box-shadow:var(--shadow);
      }
      .brand{display:flex;align-items:center;gap:12px}
      .logo{
        width:44px;height:44px;border-radius:12px;background-image:var(--accent);
        display:grid;place-items:center;font-weight:700;color:var(--button-text);letter-spacing:.04em;
      }
      .brand h1{margin:0 0 6px;font-size:18px;line-height:1.2}
      .brand p{margin:0;color:var(--muted);font-size:13px;line-height:1.45}
      .actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-end}
      .toolbar-stack{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
      .toolbar-meta,.toolbar-nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}
      .doc-btn, .smallbtn{
        border:none;
        border-radius:10px;
        padding:10px 14px;
        font-size:14px;
        font-weight:600;
        background:var(--button-bg);
        color:var(--button-text);
        cursor:pointer;
        box-shadow:var(--button-shadow);
      }
      .doc-btn:hover, .smallbtn:hover{box-shadow:var(--button-shadow-hover)}
      .doc-btn.ghost, .smallbtn{
        background:transparent;
        color:var(--text);
        border:1px solid var(--border);
        box-shadow:none;
      }
      .doc-btn.disabled{
        pointer-events:none;
        opacity:.7;
      }
      body[data-theme="light"] .doc-btn.ghost:hover,
      body[data-theme="light"] .smallbtn:hover{
        background:#f1ece2;
        color:#171717;
        border-color:#cfc6b6;
      }
      body[data-theme="dark"] .doc-btn.ghost:hover,
      body[data-theme="dark"] .smallbtn:hover{
        background:rgba(255,255,255,.04);
      }
      .badge{
        padding:7px 10px;
        border-radius:10px;
        border:1px solid var(--border);
        color:var(--muted);
        font-size:12px;
        background:var(--panel);
      }
      .theme-toggle{
        display:inline-flex;
        align-items:center;
        gap:10px;
        padding:8px 12px;
        border:1px solid var(--border);
        border-radius:999px;
        background:var(--panel);
        color:var(--text);
        cursor:pointer;
      }
      .theme-toggle-label{
        font-size:12px;
        color:var(--muted);
        user-select:none;
      }
      .theme-toggle input{
        position:absolute;
        opacity:0;
        pointer-events:none;
      }
      .theme-toggle-track{
        width:42px;
        height:24px;
        border-radius:999px;
        background:color-mix(in srgb, var(--border) 80%, transparent);
        border:1px solid var(--border);
        padding:2px;
        display:inline-flex;
        align-items:center;
      }
      .theme-toggle-thumb{
        width:18px;
        height:18px;
        border-radius:999px;
        background:var(--text);
        transform:translateX(0);
        transition:transform 140ms ease, background 140ms ease;
      }
      .theme-toggle input:checked + .theme-toggle-track{
        background:var(--button-bg);
        border-color:color-mix(in srgb, var(--button-text) 16%, var(--border));
      }
      .theme-toggle input:checked + .theme-toggle-track .theme-toggle-thumb{
        transform:translateX(18px);
        background:var(--button-text);
      }
      .layout{display:grid;grid-template-columns:280px 1fr;gap:16px}
      .sidebar{
        background:var(--panel);
        border:1px solid var(--border);
        border-radius:14px;
        padding:12px;
        box-shadow:var(--shadow);
        display:flex;
        flex-direction:column;
        gap:10px;
        position:sticky;
        top:20px;
        height:fit-content;
      }
      .sidebar-head{display:flex;justify-content:space-between;align-items:center;padding:2px 2px 6px}
      .section-list{display:flex;flex-direction:column;gap:8px}
      .section-item{
        border:1px solid var(--border);
        border-radius:10px;
        padding:9px 10px;
        background:var(--card);
        color:var(--text);
        display:flex;
        align-items:center;
        justify-content:flex-start;
        gap:8px;
        text-align:left;
        transition:border-color 120ms ease, background 120ms ease, transform 120ms ease;
      }
      .section-item:hover{border-color:var(--accent-solid);transform:translateY(-1px)}
      .section-item.current{
        border-color:var(--active-bg);
        background:var(--active-bg);
        color:var(--active-text);
        box-shadow:var(--button-shadow);
      }
      .section-item.current .chip{
        color:var(--active-text);
        border-color:color-mix(in srgb, var(--active-text) 20%, transparent);
      }
      .section-title{font-weight:600;font-size:14px;flex:1 1 auto;min-width:0}
      .chip{
        padding:4px 8px;
        border-radius:999px;
        border:1px solid var(--border);
        font-size:12px;
        color:var(--muted);
      }
      .workspace{
        background:var(--panel);
        border:1px solid var(--border);
        border-radius:14px;
        padding:12px;
        box-shadow:var(--shadow);
        display:flex;
        flex-direction:column;
        gap:10px;
      }
      .summary-row{display:flex;flex-direction:column;gap:12px}
      .card{
        background:var(--card);
        border:1px solid var(--border);
        border-radius:12px;
        overflow:hidden;
      }
      .cardhead{
        padding:14px 16px 12px;
        border-bottom:1px solid var(--border);
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
      }
      .methodtitle{display:flex;flex-direction:column;gap:8px}
      .methodtitle h2{margin:0;font-size:18px;line-height:1.25}
      .methodmeta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .tag{
        font-size:11px;
        padding:4px 8px;
        border-radius:999px;
        border:1px solid var(--border);
        background:var(--panel);
        color:var(--muted);
      }
      .tag.get,.tag.post{color:var(--text)}
      .section{display:flex;flex-direction:column;gap:12px}
      .section-text{
        max-width: 78ch;
        font-size:16px;
        line-height:1.75;
        color:var(--text);
        margin-top:6px;
        font-weight:400;
        letter-spacing:.01em;
      }
      .section-text p{
        margin:0 0 14px;
      }
      .section-text strong{font-weight:700;color:var(--text)}
      .section-text em{font-style:italic}
      .section-text p:last-child{
        margin-bottom:0;
      }
      .section-text ul,
      .section-text ol{
        margin:0 0 14px 22px;
        padding:0;
      }
      .section-text ul{list-style-type:disc}
      .section-text ul ul{list-style-type:circle}
      .section-text ul ul ul{list-style-type:square}
      .section-text ol{list-style-type:decimal}
      .section-text ol ol{list-style-type:lower-alpha}
      .section-text ol ol ol{list-style-type:decimal}
      .section-text li{
        margin:0 0 6px;
      }
      .section-text blockquote{
        margin:0 0 14px;
        padding:10px 14px;
        border-left:3px solid var(--accent-solid);
        background:color-mix(in srgb, var(--panel) 92%, transparent);
        border-radius:10px;
      }
      .section-text code{
        font-family:var(--mono);
        font-size:.92em;
        padding:2px 6px;
        border-radius:6px;
        background:var(--input-bg);
        color:var(--input-text);
      }
      .section-text a{
        color:var(--accent-solid);
        text-decoration:underline;
        text-underline-offset:2px;
      }
      .section-text .doc-anchor-marker{
        display:inline-block;
        width:0;
        height:0;
        overflow:hidden;
      }
      .section-text .prose-heading{
        margin:0 0 12px;
        font-size:1.05em;
        line-height:1.35;
      }
      .url{
        font-family:var(--mono);
        font-size:12px;
        padding:10px 12px;
        border-radius:10px;
        border:1px dashed var(--border);
        background:var(--input-bg);
        color:var(--input-text);
        display:flex;gap:10px;align-items:center;justify-content:space-between;
        max-width:100%;overflow:auto;
      }
      details{
        border:1px solid var(--border);
        border-radius:10px;
        background:color-mix(in srgb, var(--panel) 96%, transparent);
        overflow:hidden;
      }
      summary{
        cursor:pointer;
        list-style:none;
        padding:12px 14px;
        font-weight:600;
        display:flex;
        align-items:center;
        justify-content:space-between;
        font-size:15px;
      }
      summary::-webkit-details-marker{display:none}
      .sumhint{color:var(--muted);font-weight:500;font-size:12px}
      table{
        width:100%;
        border-collapse:collapse;
        min-width:600px;
        font-size:13px;
      }
      th,td{
        padding:11px 12px;
        border-bottom:1px solid var(--border);
        text-align:left;
        vertical-align:top;
      }
      th{
        background:var(--preview-table-head);
        font-weight:600;
        font-size:12px;
        letter-spacing:.01em;
      }
      tbody tr:nth-child(odd) td{
        background:color-mix(in srgb, var(--card) 96%, transparent);
      }
      .table-shell{border-top:1px solid var(--border);overflow:auto}
      pre{
        margin:0;
        background:var(--input-bg);
        color:var(--input-text);
        border:1px solid var(--border);
        border-radius:10px;
        padding:12px;
        overflow:auto;
        position:relative;
        font-size:12px;
        line-height:1.5;
        font-family:var(--mono);
      }
      .code-block{display:block;white-space:pre-wrap;word-break:break-word}
      .code-token.code-key{color:#f59e0b}
      .code-token.code-string,.code-token.code-url{color:#22c55e}
      .code-token.code-number{color:#38bdf8}
      .code-token.code-boolean,.code-token.code-null,.code-token.code-keyword,.code-token.code-flag{color:#f97316}
      .code-token.code-punctuation{color:#94a3b8}
      .pretools{position:absolute;top:8px;right:8px;display:flex;gap:8px}
      .note{
        border-radius:10px;
        padding:10px 12px;
        border:1px solid var(--border);
        background:color-mix(in srgb, var(--panel) 92%, transparent);
      }
      .note.bad{border-color:#ef4444;color:#ef4444}
      .muted{color:var(--muted)}
      body[data-theme="light"] .theme-toggle{
        background:#fffdfa;
        border-color:#d8d1c2;
      }
      body[data-theme="light"] .theme-toggle-track{
        background:#ece6da;
        border-color:#d6cdbc;
      }
      body[data-theme="light"] .theme-toggle-thumb{
        background:#111111;
      }
      body[data-theme="light"] .theme-toggle input:checked + .theme-toggle-track{
        background:#111111;
        border-color:#111111;
      }
      body[data-theme="light"] .theme-toggle input:checked + .theme-toggle-track .theme-toggle-thumb{
        background:#ffffff;
      }
      body[data-theme="light"] .topbar,
      body[data-theme="light"] .sidebar,
      body[data-theme="light"] .workspace{
        background:color-mix(in srgb, var(--panel) 92%, #ffffff 8%);
        border-color:#d8d1c2;
        box-shadow:0 10px 24px rgba(15, 23, 42, 0.05);
      }
      body[data-theme="light"] .card{
        background:#fffdfa;
        border-color:#ddd5c7;
      }
      body[data-theme="light"] .section-item{
        background:#fffdfa;
        border-color:#dfd9cc;
      }
      body[data-theme="light"] .section-item:hover{
        border-color:#b8ae9c;
        background:#faf6ee;
      }
      body[data-theme="light"] .section-item.current{
        background:#111111;
        color:#ffffff;
        border-color:#111111;
        box-shadow:0 10px 20px rgba(17, 17, 17, 0.14);
      }
      body[data-theme="light"] .section-item.current .chip{
        color:#ffffff;
        border-color:rgba(255,255,255,.22);
      }
      body[data-theme="light"] .doc-btn.ghost:hover,
      body[data-theme="light"] .smallbtn:hover{
        background:#f1ece2;
        color:#171717;
        border-color:#cfc6b6;
      }
      body[data-theme="light"] details{
        background:#fffdfa;
      }
      body[data-theme="light"] th{
        background:#f3efe6;
      }
      @media (max-width: 1024px){
        .layout{grid-template-columns:1fr}
        .sidebar{position:static;min-height:auto}
        .actions,.toolbar-stack,.toolbar-meta,.toolbar-nav{justify-content:flex-start;align-items:flex-start}
      }
    </style>`,
    '</head>',
    `<body data-theme="${initialTheme}">`,
    '<div class="shell">',
    '<header class="topbar">',
    '<div class="brand">',
    '<div class="logo">DB</div>',
    '<div>',
    '<h1>Документация API</h1>',
    '<p>Экспортируемая версия документации в том же оформлении, что и редактор.</p>',
    '</div>',
    '</div>',
    '<div class="toolbar-stack">',
    '<div class="toolbar-meta">',
    `<span class="badge">Sections: ${visibleSections.length}</span>`,
    requestSections.length > 0 ? `<span class="badge">Request blocks: ${requestSections.length}</span>` : '',
    responseSections.length > 0 ? `<span class="badge">Response blocks: ${responseSections.length}</span>` : '',
    interactive
      ? [
          '<label class="theme-toggle" aria-label="Переключить тему">',
          '<span class="theme-toggle-label">Темная</span>',
          `<input type="checkbox" id="theme-toggle" ${initialTheme === 'light' ? 'checked' : ''} />`,
          '<span class="theme-toggle-track" aria-hidden="true"><span class="theme-toggle-thumb"></span></span>',
          '<span class="theme-toggle-label">Светлая</span>',
          '</label>'
        ].join('')
      : '<span class="badge">Preview</span>',
    '</div>',
    '<div class="toolbar-nav">',
    renderButton('К началу', '#top', 'ghost', interactive),
    '</div>',
    '</div>',
    '</header>',
    '<div class="layout" id="top">',
    renderSidebar(visibleSections, interactive),
    `<main class="workspace" id="content"><div class="summary-row">${blocks.join('')}</div></main>`,
    '</div>',
    '</div>',
    interactive
      ? `<script>
      const themes = ${JSON.stringify(themeConfig)};
      const root = document.documentElement;
      const body = document.body;
      const toggle = document.getElementById('theme-toggle');
      const tokenMap = {
        bg: '--bg',
        panel: '--panel',
        card: '--card',
        previewText: '--text',
        muted: '--muted',
        accent: '--accent',
        accentSolid: '--accent-solid',
        border: '--border',
        shadow: '--shadow',
        inputBg: '--input-bg',
        inputText: '--input-text',
        scrollbarTrack: '--scrollbar-track',
        scrollbarThumb: '--scrollbar-thumb',
        scrollbarThumbHover: '--scrollbar-thumb-hover',
        buttonBg: '--button-bg',
        buttonText: '--button-text',
        buttonShadow: '--button-shadow',
        buttonShadowHover: '--button-shadow-hover',
        activeBg: '--active-bg',
        activeText: '--active-text',
        previewTableHead: '--preview-table-head'
      };
      function applyTheme(nextTheme) {
        const tokens = themes[nextTheme];
        body.dataset.theme = nextTheme;
        root.style.colorScheme = nextTheme;
        Object.entries(tokenMap).forEach(([key, cssVar]) => {
          root.style.setProperty(cssVar, tokens[key]);
        });
        if (toggle instanceof HTMLInputElement) {
          toggle.checked = nextTheme === 'light';
        }
      }
      toggle?.addEventListener('change', () => {
        applyTheme(body.dataset.theme === 'dark' ? 'light' : 'dark');
      });
      document.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const copyText = target.dataset.copyText;
        const copyTarget = target.dataset.copyTarget;
        if (!copyText && !copyTarget) return;
        let value = copyText || '';
        if (copyTarget) {
          const node = document.getElementById(copyTarget);
          value = node?.textContent || '';
        }
        if (!value) return;
        try {
          await navigator.clipboard.writeText(value);
          const previous = target.textContent;
          target.textContent = 'Copied';
          setTimeout(() => {
            target.textContent = previous;
          }, 900);
        } catch {}
      });
      const navLinks = Array.from(document.querySelectorAll('[data-section-link]'));
      const setCurrentSection = (id) => {
        navLinks.forEach((link) => {
          link.classList.toggle('current', link.dataset.sectionLink === id);
        });
      };
      const syncCurrentFromHash = () => {
        const currentHash = window.location.hash.replace('#', '');
        const fallback = navLinks[0]?.dataset.sectionLink || '';
        setCurrentSection(currentHash || fallback);
      };
      window.addEventListener('hashchange', syncCurrentFromHash);
      syncCurrentFromHash();
      applyTheme(body.dataset.theme || 'dark');
    </script>`
      : '',
    '</body>',
    '</html>'
  ].join('\n');
}
