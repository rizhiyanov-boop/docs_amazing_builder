import { getRequestColumnLabel, getRequestColumnOrder } from './requestColumns';
import { getRequestAuthInfo, getRequestHeaderRows, getRequestRows, requestHasRows, splitRequestRows } from './requestHeaders';
import { richTextToHtml } from './richText';
import { resolveSectionTitle } from './sectionTitles';
import { buildInputFromRows } from './sourceSync';
import { getThemeTokens } from './theme';
import { getDiagramExportFileName, getDiagramImageUrl, resolveDiagramEngine } from './diagramUtils';
import type { ThemeName } from './theme';
import type { DiagramSection, DocSection, ErrorsSection, ParseFormat, ParsedRow, ParsedSection, TextSection } from './types';

type RenderHtmlOptions = {
  interactive?: boolean;
  diagramImageSource?: 'remote' | 'local-jpeg';
  diagramImageMap?: Record<string, string>;
  diagramLocalFiles?: Record<string, boolean>;
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
  if (!section.enabled) return true;
  return Boolean(section.value.trim());
}

function hasParsedSourceExample(section: ParsedSection): boolean {
  const hasServerInput = Boolean(section.input.trim());
  const hasClientInput = Boolean(section.domainModelEnabled && (section.clientInput ?? '').trim());
  return hasServerInput || hasClientInput;
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  if (!section.enabled) return true;
  if (isDualModelSection(section)) {
    return Boolean(section.error) || Boolean(section.clientError) || requestHasRows(section) || hasParsedSourceExample(section);
  }
  return Boolean(section.error) || section.rows.length > 0;
}

function shouldRenderDiagramSection(section: DiagramSection): boolean {
  if (!section.enabled) return true;
  return section.diagrams.some((diagram) => diagram.code.trim());
}

function shouldRenderErrorsSection(section: ErrorsSection): boolean {
  if (!section.enabled) return true;
  return section.rows.length > 0 || section.validationRules.length > 0;
}

function renderCell(value: string): string {
  const normalized = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  if (!normalized) return '&mdash;';
  return escapeHtml(normalized).replaceAll('\n', '<br/>');
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

function renderCopyIconButton(dataAttr: string, value: string): string {
  return [
    `<button class="smallbtn icon-copy-btn" type="button" ${dataAttr}="${escapeHtml(value)}" aria-label="Копировать" title="Копировать">`,
    '<svg class="copy-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H10V7h9v14z"/></svg>',
    '<svg class="copy-check-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.5-1.5z"/></svg>',
    '<span class="visually-hidden">Копировать</span>',
    '</button>'
  ].join('');
}

function renderUrl(value: string, label = 'URL', interactive = true): string {
  if (!value.trim()) return '';
  const action = interactive ? renderCopyIconButton('data-copy-text', value) : '';
  return `<div class="url"><span>${escapeHtml(label)}: ${escapeHtml(value)}</span>${action}</div>`;
}

function renderCodeBlock(id: string, title: string, content: string, interactive = true, format: ParseFormat = 'json'): string {
  if (!content.trim()) return '';
  return [
    '<details open>',
    `<summary>${escapeHtml(title)} <span class="sumhint">example</span></summary>`,
    `<pre>${
      interactive
        ? `<div class="pretools">${renderCopyIconButton('data-copy-target', id)}</div>`
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

  return `<div class="table-shell"><table><thead><tr><th>Поле</th><th>Тип</th><th>Обязательность</th><th>Описание</th><th>Пример</th></tr></thead><tbody>${body}</tbody></table></div>`;
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

  return `<div class="table-shell"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
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
  if (!section.enabled) {
    return wrapCard(section.id, title, '', '<span class="muted">Не используется</span>');
  }
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
    '<div class="table-shell"><table>',
    '<thead><tr><th>Параметр</th><th>Значение</th></tr></thead>',
    '<tbody>',
    ...authInfo.details.map((detail) => `<tr><td>${escapeHtml(detail.label)}</td><td>${renderCell(detail.value)}</td></tr>`),
    '</tbody>',
    '</table></div>',
    '</details>'
  ].join('');
}

function renderRequestSection(section: ParsedSection, interactive = true): string {
  const title = resolveSectionTitle(section.title);
  if (!section.enabled) {
    return wrapCard(section.id, title, [renderTag('REQUEST'), renderTag(section.format.toUpperCase())].join(' '), '<span class="muted">Не используется</span>');
  }

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
    `<details open><summary>Общее описание метода <span class="sumhint">${escapeHtml(requestProtocol)}</span></summary><div class="table-shell"><table><tbody><tr><td>URL</td><td>${renderCell(
      requestUrl
    )}</td></tr><tr><td>Метод</td><td>${renderCell(requestMethod)}</td></tr><tr><td>Протокол</td><td>${renderCell(requestProtocol)}</td></tr></tbody></table></div></details>`,
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
      ? `<details open><summary>Внешний вызов <span class="sumhint">${escapeHtml(requestProtocol)}</span></summary><div class="table-shell"><table><tbody><tr><td>Внешний URL</td><td>${renderCell(
          externalRequestUrl
        )}</td></tr><tr><td>Метод</td><td>${renderCell(externalRequestMethod)}</td></tr><tr><td>Протокол</td><td>${renderCell(requestProtocol)}</td></tr></tbody></table></div></details>`
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
  if (!section.enabled) {
    return wrapCard(section.id, title, [renderTag('RESPONSE'), renderTag(section.format.toUpperCase())].join(' '), '<span class="muted">Не используется</span>');
  }

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
  if (!section.enabled) {
    return wrapCard(section.id, title, renderTag(section.format.toUpperCase()), '<span class="muted">Не используется</span>');
  }

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

function renderDiagramSection(
  section: DiagramSection,
  diagramImageSource: 'remote' | 'local-jpeg' = 'remote',
  diagramImageMap?: Record<string, string>,
  diagramLocalFiles?: Record<string, boolean>,
  interactive = true
): string {
  const title = resolveSectionTitle(section.title);
  if (!section.enabled) {
    return wrapCard(section.id, title, renderTag('DIAGRAM'), '<span class="muted">Не используется</span>');
  }

  const body = section.diagrams
    .filter((diagram) => diagram.code.trim())
    .map((diagram, index) => {
      const diagramTitle = diagram.title.trim() || `Диаграмма ${index + 1}`;
      const effectiveEngine = resolveDiagramEngine(diagram.code, diagram.engine);
      const localFileName = getDiagramExportFileName(title, section.id, diagram.title, index, 'jpeg');
      const embeddedImage = diagramImageMap?.[localFileName];
      const remoteUrl = getDiagramImageUrl(effectiveEngine, diagram.code, 'jpeg');
      const hasLocalFile = Boolean(diagramLocalFiles?.[localFileName]);
      const imageUrl = embeddedImage ?? (diagramImageSource === 'local-jpeg' && hasLocalFile ? localFileName : remoteUrl);

      return [
        '<details open>',
        `<summary>${escapeHtml(diagramTitle)} <span class="sumhint">${escapeHtml(effectiveEngine.toUpperCase())}</span></summary>`,
        interactive
          ? [
              '<div class="diagram-viewer" data-diagram-viewer>',
              '<div class="diagram-viewer-toolbar">',
              '<span class="diagram-viewer-hint">Drag to move, wheel to zoom</span>',
              '<span class="diagram-viewer-controls">',
              '<button class="smallbtn" type="button" data-diagram-action="zoom-out">-</button>',
              '<button class="smallbtn" type="button" data-diagram-action="zoom-in">+</button>',
              '<button class="smallbtn" type="button" data-diagram-action="fit">Fit</button>',
              '</span>',
              '</div>',
              '<div class="diagram-viewport" data-diagram-viewport>',
              `<img class="diagram-image-interactive" data-diagram-image src="${escapeHtml(imageUrl)}" alt="${escapeHtml(diagramTitle)}" draggable="false" />`,
              '</div>',
              '</div>'
            ].join('')
          : `<div class="section-text"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(diagramTitle)}" style="max-width:100%;border:1px solid var(--border);border-radius:10px;" /></div>`,
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
  if (!section.enabled) {
    return wrapCard(section.id, title, renderTag('ERRORS'), '<span class="muted">Не используется</span>');
  }

  const bodyRows = section.rows
    .map(
      (row, index) =>
        `<tr><td>${index + 1}</td><td>${renderCell(row.clientHttpStatus)}</td><td>${renderCell(row.clientResponse)}</td><td>${renderCell(row.trigger)}</td><td>${renderCell(row.errorType)}</td><td>${renderCell(row.serverHttpStatus)}</td><td>${renderCell(row.internalCode)}</td><td>${renderCell(row.message)}</td></tr>`
    )
    .join('');

  const validationRows = section.validationRules
    .map(
      (row, index) =>
        `<tr><td>${index + 1}</td><td>${renderCell(row.parameter)}</td><td>${renderCell(row.validationCase)}</td><td>${renderCell(row.condition)}</td><td>${renderCell(row.cause)}</td></tr>`
    )
    .join('');

  const errorsTable = section.rows.length
    ? `<div class="table-shell"><table><thead><tr><th>№</th><th>Client HTTP Status</th><th>Client Response</th><th>Trigger (условия возникновения)</th><th>Error Type</th><th>Server HTTP Status</th><th>Полный internalCode</th><th>Server Response</th></tr></thead><tbody>${bodyRows}</tbody></table></div>`
    : '';
  const validationTable = section.validationRules.length
    ? `<h3>Правила валидации</h3><div class="table-shell"><table><thead><tr><th>№</th><th>Параметр (server request)</th><th>Кейс валидации</th><th>Условие возникновения</th><th>cause</th></tr></thead><tbody>${validationRows}</tbody></table></div>`
    : '';
  const body = [errorsTable, validationTable].filter(Boolean).join('');
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
      const badge =
        section.kind === 'parsed'
          ? `<span class="chip">${escapeHtml(
              section.sectionType === 'request'
                ? 'REQUEST'
                : section.sectionType === 'response'
                  ? 'RESPONSE'
                  : section.format.toUpperCase()
            )}</span>`
          : '';
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
  const diagramImageSource = options.diagramImageSource ?? 'remote';
  const diagramImageMap = options.diagramImageMap;
  const diagramLocalFiles = options.diagramLocalFiles;
  const visibleSections = getVisibleSections(sections);
  const blocks = visibleSections.map((section) => {
    if (section.kind === 'text') return renderTextSection(section);
    if (section.kind === 'parsed') return renderParsedSection(section, interactive);
    if (section.kind === 'diagram') return renderDiagramSection(section, diagramImageSource, diagramImageMap, diagramLocalFiles, interactive);
    return renderErrorsSection(section);
  });
  const darkTokens = getThemeTokens('dark');
  const lightTokens = getThemeTokens('light');
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
        --font-sans:"Segoe UI Variable Text", "Segoe UI", "Noto Sans", "Helvetica Neue", system-ui, -apple-system, sans-serif;
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
        font-family:var(--font-sans);
        font-size:13px;
        line-height:1.45;
        font-weight:400;
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
        padding:12px 14px;
        box-shadow:var(--shadow);
        position:sticky;
        top:12px;
        z-index:40;
        backdrop-filter:saturate(140%) blur(6px);
      }
      .brand{display:flex;align-items:center;gap:12px}
      .logo{
        width:44px;height:44px;border-radius:12px;background-image:var(--accent);
        display:grid;place-items:center;font-weight:700;color:var(--button-text);letter-spacing:.04em;
      }
      .brand h1{margin:0 0 4px;font-size:15px;line-height:1.2;font-weight:600;letter-spacing:.01em}
      .brand p{margin:0;color:var(--muted);font-size:12px;line-height:1.4}
      .actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-end}
      .toolbar-stack{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
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
        font-size:11px;
        background:var(--panel);
      }
      .theme-switch{
        display:inline-flex;
        align-items:center;
        gap:4px;
        padding:4px;
        border:1px solid var(--border);
        border-radius:999px;
        background:var(--panel);
      }
      .theme-switch-btn{
        border:none;
        background:transparent;
        color:var(--muted);
        width:34px;
        height:34px;
        display:inline-grid;
        place-items:center;
        border-radius:999px;
        cursor:pointer;
        transition:background 120ms ease, color 120ms ease;
      }
      .theme-switch-btn:hover{
        color:var(--text);
        background:color-mix(in srgb, var(--panel) 84%, var(--border));
      }
      .theme-switch-btn.active{
        background:var(--button-bg);
        color:var(--button-text);
      }
      .theme-switch-icon{
        width:16px;
        height:16px;
        display:block;
        fill:currentColor;
      }
      .icon-copy-btn{
        width:30px;
        height:30px;
        padding:0;
        display:inline-grid;
        place-items:center;
      }
      .icon-copy-btn .copy-icon,
      .icon-copy-btn .copy-check-icon{
        width:14px;
        height:14px;
        display:block;
        fill:currentColor;
      }
      .icon-copy-btn .copy-check-icon{display:none}
      .icon-copy-btn.copied{
        background:var(--button-bg);
        color:var(--button-text);
        border-color:color-mix(in srgb, var(--button-text) 12%, transparent);
      }
      .icon-copy-btn.copied .copy-icon{display:none}
      .icon-copy-btn.copied .copy-check-icon{display:block}
      .visually-hidden{
        position:absolute;
        width:1px;
        height:1px;
        padding:0;
        margin:-1px;
        overflow:hidden;
        clip:rect(0, 0, 0, 0);
        white-space:nowrap;
        border:0;
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
        top:88px;
        height:fit-content;
        max-height:calc(100vh - 112px);
        overflow:auto;
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
        padding:14px;
        box-shadow:var(--shadow);
        display:flex;
        flex-direction:column;
        gap:12px;
      }
      .summary-row{display:flex;flex-direction:column;gap:12px}
      .card{
        background:var(--card);
        border:1px solid var(--border);
        border-radius:12px;
        overflow:hidden;
      }
      .cardhead{
        padding:13px 15px 10px;
        border-bottom:1px solid var(--border);
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
      }
      .methodtitle{display:flex;flex-direction:column;gap:8px}
      .methodtitle h2{margin:0;font-size:16px;line-height:1.25;font-weight:600}
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
      .section{padding:12px 14px 14px}
      .section-text{
        max-width: 78ch;
        font-size:14px;
        line-height:1.65;
        color:var(--text);
        margin-top:2px;
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
        font-size:11px;
        padding:10px 12px;
        border-radius:10px;
        border:1px dashed var(--border);
        background:var(--input-bg);
        color:var(--input-text);
        display:flex;gap:10px;align-items:flex-start;justify-content:space-between;
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
        padding:10px 12px;
        font-weight:550;
        display:flex;
        align-items:center;
        justify-content:space-between;
        font-size:14px;
      }
      summary::-webkit-details-marker{display:none}
      .sumhint{color:var(--muted);font-weight:500;font-size:11px}
      table{
        width:100%;
        border-collapse:collapse;
        min-width:640px;
        font-size:12px;
      }
      th,td{
        padding:9px 10px;
        border-bottom:1px solid var(--border);
        text-align:left;
        vertical-align:top;
        white-space:pre-wrap;
        overflow-wrap:anywhere;
        word-break:break-word;
      }
      th{
        background:var(--preview-table-head);
        font-weight:600;
        font-size:11px;
        letter-spacing:.01em;
        position:sticky;
        top:0;
        z-index:3;
      }
      tbody tr:nth-child(odd) td{
        background:color-mix(in srgb, var(--card) 96%, transparent);
      }
      .table-shell{
        border-top:1px solid var(--border);
        overflow:auto;
        max-height:min(62vh, 520px);
      }
      .diagram-viewer{
        border:1px solid var(--border);
        border-radius:10px;
        background:var(--input-bg);
        overflow:hidden;
      }
      .diagram-viewer-toolbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        padding:8px 10px;
        border-bottom:1px solid var(--border);
        background:color-mix(in srgb, var(--panel) 92%, transparent);
      }
      .diagram-viewer-hint{
        font-size:12px;
        color:var(--muted);
      }
      .diagram-viewer-controls{
        display:inline-flex;
        align-items:center;
        gap:6px;
      }
      .diagram-viewport{
        position:relative;
        width:100%;
        min-height:280px;
        height:clamp(280px, 62vh, 860px);
        overflow:hidden;
        touch-action:none;
        cursor:grab;
      }
      .diagram-viewport.dragging{
        cursor:grabbing;
      }
      .diagram-image-interactive{
        position:absolute;
        left:50%;
        top:50%;
        transform-origin:center center;
        will-change:transform;
        user-select:none;
        -webkit-user-drag:none;
        border:1px solid var(--border);
        border-radius:10px;
        background:#fff;
      }
      pre{
        margin:0;
        background:var(--input-bg);
        color:var(--input-text);
        border:1px solid var(--border);
        border-radius:10px;
        padding:10px;
        overflow:auto;
        position:relative;
        font-size:11px;
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
        padding:9px 10px;
        border:1px solid var(--border);
        background:color-mix(in srgb, var(--panel) 92%, transparent);
      }
      .note.bad{border-color:#ef4444;color:#ef4444}
      .muted{color:var(--muted)}
      body[data-theme="light"] .theme-switch{
        background:#fffdfa;
        border-color:#d8d1c2;
      }
      body[data-theme="light"] .theme-switch-btn:hover{
        background:#f1ece2;
        color:#171717;
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
        .actions,.toolbar-stack,.toolbar-meta,.toolbar-nav{justify-content:flex-start;align-items:center}
      }
      @media (max-width: 720px){
        .shell{padding:14px 12px 24px}
        .topbar{top:8px;padding:12px}
        .cardhead{align-items:flex-start;flex-direction:column}
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
    interactive
      ? [
          '<div class="theme-switch" role="group" aria-label="Переключить тему">',
          '<button type="button" class="theme-switch-btn" data-theme-select="dark" aria-pressed="false" aria-label="Темная тема" title="Темная тема">',
          '<svg class="theme-switch-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.354 15.354A9 9 0 0 1 8.646 3.646a1 1 0 0 0-1.205-1.542A11 11 0 1 0 21.896 16.56a1 1 0 0 0-1.542-1.206z"/></svg>',
          '<span class="visually-hidden">Темная</span>',
          '</button>',
          '<button type="button" class="theme-switch-btn" data-theme-select="light" aria-pressed="false" aria-label="Светлая тема" title="Светлая тема">',
          '<svg class="theme-switch-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm0 14a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm8-7a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1zM6 12a1 1 0 0 1-1 1H4a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1zm10.95-5.536a1 1 0 0 1 1.414 1.414l-.707.707a1 1 0 1 1-1.414-1.414l.707-.707zM7.757 15.95a1 1 0 0 1 1.414 1.414l-.707.707A1 1 0 0 1 7.05 16.657l.707-.707zm9.9 2.121a1 1 0 0 1-1.414 0l-.707-.707a1 1 0 0 1 1.414-1.414l.707.707a1 1 0 0 1 0 1.414zM8.464 8.464A1 1 0 0 1 7.05 7.05l.707-.707a1 1 0 0 1 1.414 1.414l-.707.707zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/></svg>',
          '<span class="visually-hidden">Светлая</span>',
          '</button>',
          '</div>'
        ].join('')
      : '<span class="badge">Preview</span>',
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
      const themeButtons = Array.from(document.querySelectorAll('[data-theme-select]'));
      const preferredThemeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      let themeLockedByUser = false;
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
        themeButtons.forEach((button) => {
          if (!(button instanceof HTMLElement)) return;
          const isActive = button.dataset.themeSelect === nextTheme;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
      }
      function getSystemTheme() {
        return preferredThemeMedia?.matches ? 'dark' : 'light';
      }
      themeButtons.forEach((button) => {
        if (!(button instanceof HTMLElement)) return;
        button.addEventListener('click', () => {
          const targetTheme = button.dataset.themeSelect;
          if (targetTheme === 'dark' || targetTheme === 'light') {
            themeLockedByUser = true;
            applyTheme(targetTheme);
          }
        });
      });
      preferredThemeMedia?.addEventListener?.('change', () => {
        if (themeLockedByUser) return;
        applyTheme(getSystemTheme());
      });
      document.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const actionNode = target.closest('[data-copy-text], [data-copy-target]');
        if (!(actionNode instanceof HTMLElement)) return;
        const copyText = actionNode.dataset.copyText;
        const copyTarget = actionNode.dataset.copyTarget;
        if (!copyText && !copyTarget) return;
        let value = copyText || '';
        if (copyTarget) {
          const node = document.getElementById(copyTarget);
          value = node?.textContent || '';
        }
        if (!value) return;
        try {
          await navigator.clipboard.writeText(value);
          actionNode.classList.add('copied');
          actionNode.setAttribute('aria-label', 'Скопировано');
          actionNode.setAttribute('title', 'Скопировано');
          setTimeout(() => {
            actionNode.classList.remove('copied');
            actionNode.setAttribute('aria-label', 'Копировать');
            actionNode.setAttribute('title', 'Копировать');
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

      const initDiagramViewer = (viewer) => {
        const viewport = viewer.querySelector('[data-diagram-viewport]');
        const image = viewer.querySelector('[data-diagram-image]');
        if (!(viewport instanceof HTMLElement) || !(image instanceof HTMLImageElement)) return;

        const controls = viewer.querySelectorAll('[data-diagram-action]');
        const state = {
          scale: 1,
          minScale: 0.08,
          maxScale: 8,
          x: 0,
          y: 0,
          fitScale: 1,
          dragging: false,
          lastX: 0,
          lastY: 0
        };

        const render = () => {
          image.style.transform = 'translate(-50%, -50%) translate(' + state.x + 'px, ' + state.y + 'px) scale(' + state.scale + ')';
        };

        const fitToWidth = () => {
          if (!image.naturalWidth) return;
          state.fitScale = Math.max(0.01, viewport.clientWidth / image.naturalWidth);
          state.scale = state.fitScale;
          state.x = 0;
          state.y = 0;
          render();
        };

        const applyZoom = (nextScale, anchorClientX, anchorClientY) => {
          const prevScale = state.scale;
          const clamped = Math.min(state.maxScale, Math.max(state.minScale, nextScale));
          if (clamped === prevScale) return;

          const rect = viewport.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const localX = anchorClientX - cx - state.x;
          const localY = anchorClientY - cy - state.y;
          const ratio = clamped / prevScale;

          state.x -= localX * (ratio - 1);
          state.y -= localY * (ratio - 1);
          state.scale = clamped;
          render();
        };

        image.addEventListener('load', fitToWidth);
        if (image.complete) fitToWidth();

        const observer = new ResizeObserver(() => {
          if (Math.abs(state.scale - state.fitScale) < 0.001) {
            fitToWidth();
          }
        });
        observer.observe(viewport);

        viewport.addEventListener('wheel', (event) => {
          event.preventDefault();
          const factor = event.deltaY < 0 ? 1.1 : 0.9;
          applyZoom(state.scale * factor, event.clientX, event.clientY);
        }, { passive: false });

        viewport.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          state.dragging = true;
          state.lastX = event.clientX;
          state.lastY = event.clientY;
          viewport.classList.add('dragging');
          viewport.setPointerCapture(event.pointerId);
        });

        viewport.addEventListener('pointermove', (event) => {
          if (!state.dragging) return;
          state.x += event.clientX - state.lastX;
          state.y += event.clientY - state.lastY;
          state.lastX = event.clientX;
          state.lastY = event.clientY;
          render();
        });

        const stopDragging = (event) => {
          if (!state.dragging) return;
          state.dragging = false;
          viewport.classList.remove('dragging');
          if (viewport.hasPointerCapture(event.pointerId)) {
            viewport.releasePointerCapture(event.pointerId);
          }
        };

        viewport.addEventListener('pointerup', stopDragging);
        viewport.addEventListener('pointercancel', stopDragging);

        controls.forEach((control) => {
          if (!(control instanceof HTMLElement)) return;
          control.addEventListener('click', () => {
            const action = control.dataset.diagramAction;
            const rect = viewport.getBoundingClientRect();
            const anchorX = rect.left + rect.width / 2;
            const anchorY = rect.top + rect.height / 2;

            if (action === 'zoom-in') applyZoom(state.scale * 1.2, anchorX, anchorY);
            if (action === 'zoom-out') applyZoom(state.scale / 1.2, anchorX, anchorY);
            if (action === 'fit') fitToWidth();
          });
        });

        render();
      };

      document.querySelectorAll('[data-diagram-viewer]').forEach((viewer) => {
        if (viewer instanceof HTMLElement) initDiagramViewer(viewer);
      });

      applyTheme(getSystemTheme());
    </script>`
      : '',
    '</body>',
    '</html>'
  ].join('\n');
}
