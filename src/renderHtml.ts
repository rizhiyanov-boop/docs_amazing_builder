import { getRequestColumnLabel, getRequestColumnOrder } from './requestColumns';
import { getRequestAuthInfo, getRequestRows, requestHasRows, splitRequestRows } from './requestHeaders';
import { resolveSectionTitle } from './sectionTitles';
import { getThemeTokens } from './theme';
import type { ThemeName } from './theme';
import type { DocSection, ParsedRow, ParsedSection, TextSection } from './types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isDualModelSection(section: ParsedSection): boolean {
  return section.id === 'request' || section.id === 'response';
}

function shouldRenderTextSection(section: TextSection): boolean {
  return section.enabled && Boolean(section.value.trim());
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  if (!section.enabled) return false;
  if (isDualModelSection(section)) return Boolean(section.error) || Boolean(section.clientError) || requestHasRows(section);
  return Boolean(section.error) || section.rows.length > 0;
}

function renderCell(value: string): string {
  return escapeHtml(value.trim()) || '&mdash;';
}

function renderTextValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '<span class="muted">Не заполнено</span>';
  return escapeHtml(trimmed).replaceAll('\n', '<br/>');
}

function renderTag(label: string, kind = ''): string {
  return `<span class="tag ${kind}">${escapeHtml(label)}</span>`;
}

function renderButton(label: string, href: string): string {
  return `<a class="btn" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderUrl(value: string, label = 'URL'): string {
  if (!value.trim()) return '';
  return `<div class="url"><span>${escapeHtml(label)}: ${escapeHtml(value)}</span><a class="smallbtn" href="#">Copy</a></div>`;
}

function renderCodeBlock(id: string, title: string, content: string): string {
  if (!content.trim()) return '';
  return [
    '<details open>',
    `<summary>${escapeHtml(title)} <span class="sumhint">example</span></summary>`,
    `<pre><div class="pretools"><a class="smallbtn" href="#${escapeHtml(id)}">Copy</a></div><code id="${escapeHtml(id)}">${escapeHtml(content.trim())}</code></pre>`,
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

function wrapCard(id: string, title: string, meta: string, body: string, path = '', method = ''): string {
  return [
    `<section class="card" id="${escapeHtml(id)}">`,
    '<div class="cardhead">',
    '<div class="methodtitle">',
    `<h2>${escapeHtml(title)}</h2>`,
    `<div class="methodmeta">${meta}</div>`,
    '</div>',
    path ? `<div>${renderUrl(path, method || 'Path')}</div>` : '<div></div>',
    '</div>',
    `<div class="section">${body}</div>`,
    '</section>'
  ].join('');
}

function renderTextSection(section: TextSection): string {
  const title = resolveSectionTitle(section.title);
  const meta = [renderTag('TEXT'), section.required ? renderTag('Required') : ''].join('');
  return wrapCard(section.id, title, meta, `<p class="muted">${renderTextValue(section.value)}</p>`);
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

function renderRequestSection(section: ParsedSection): string {
  const title = resolveSectionTitle(section.title);
  const { headers, otherRows, urlRow } = splitRequestRows(getRequestRows(section));
  const requestError = section.error || section.clientError;
  const meta = [renderTag('REQUEST', 'post'), renderTag(section.format.toUpperCase())].join('');
  const body = [
    renderInfoNote('Назначение', title),
    renderAuthDetails(section),
    headers.length > 0
      ? `<details open><summary>Headers <span class="sumhint">${headers.length} headers</span></summary>${renderStructuredTable(headers, section)}</details>`
      : '',
    otherRows.length > 0
      ? `<details open><summary>Request schema <span class="sumhint">${section.format.toUpperCase()}</span></summary>${renderStructuredTable(otherRows, section)}</details>`
      : '',
    renderCodeBlock('request-server-example', 'Server request example', section.input),
    section.domainModelEnabled ? renderCodeBlock('request-client-example', 'Client request example', section.clientInput ?? '') : '',
    requestError ? `<div class="note bad"><b>Ошибка секции</b><br/>${escapeHtml(requestError)}</div>` : ''
  ]
    .filter(Boolean)
    .join('');

  return wrapCard(section.id, title, meta, body, urlRow?.example ?? '', section.format.toUpperCase());
}

function renderResponseSection(section: ParsedSection): string {
  const title = resolveSectionTitle(section.title);
  const rows = getRequestRows(section);
  const responseError = section.error || section.clientError;
  const meta = [renderTag('RESPONSE', 'get'), renderTag(section.format.toUpperCase())].join('');
  const body = [
    renderInfoNote('Назначение', title),
    rows.length > 0
      ? `<details open><summary>Response schema <span class="sumhint">${rows.length} rows</span></summary>${renderStructuredTable(rows, section)}</details>`
      : '',
    renderCodeBlock('response-server-example', 'Server response example', section.input),
    section.domainModelEnabled ? renderCodeBlock('response-client-example', 'Client response example', section.clientInput ?? '') : '',
    responseError ? `<div class="note bad"><b>Ошибка секции</b><br/>${escapeHtml(responseError)}</div>` : ''
  ]
    .filter(Boolean)
    .join('');

  return wrapCard(section.id, title, meta, body);
}

function renderGenericParsedSection(section: ParsedSection): string {
  const title = resolveSectionTitle(section.title);
  const meta = [renderTag('PARSED'), renderTag(section.format.toUpperCase())].join('');
  const body = [
    `<details open><summary>Schema <span class="sumhint">${section.rows.length} rows</span></summary>${renderDefaultTable(section.rows)}</details>`,
    renderCodeBlock(`${section.id}-example`, `${title} example`, section.input),
    section.error ? `<div class="note bad"><b>Ошибка секции</b><br/>${escapeHtml(section.error)}</div>` : ''
  ]
    .filter(Boolean)
    .join('');

  return wrapCard(section.id, title, meta, body);
}

function renderParsedSection(section: ParsedSection): string {
  if (section.id === 'request') return renderRequestSection(section);
  if (section.id === 'response') return renderResponseSection(section);
  return renderGenericParsedSection(section);
}

function getVisibleSections(sections: DocSection[]): DocSection[] {
  return sections.filter((section) =>
    section.kind === 'text' ? shouldRenderTextSection(section) : shouldRenderParsedSection(section)
  );
}

function renderSidebar(sections: DocSection[]): string {
  const items = sections
    .map((section) => {
      const badge = section.kind === 'parsed' ? `<span class="badge">${escapeHtml(section.format.toUpperCase())}</span>` : '<span class="badge">TEXT</span>';
      return `<a class="navitem" href="#${escapeHtml(section.id)}">${badge}<span>${escapeHtml(resolveSectionTitle(section.title))}</span></a>`;
    })
    .join('');

  return [
    '<nav>',
    '<p class="navtitle">Содержание</p>',
    `<div class="navlist">${items}</div>`,
    '<div class="note warn" style="margin-top:14px"><b>Навигация</b><br/>Request и Response собраны как основные блоки, остальные секции идут отдельными карточками.</div>',
    '</nav>'
  ].join('');
}

export function renderHtmlDocument(sections: DocSection[], theme: ThemeName = 'dark'): string {
  const visibleSections = getVisibleSections(sections);
  const blocks = visibleSections.map((section) => (section.kind === 'text' ? renderTextSection(section) : renderParsedSection(section)));
  const tokens = getThemeTokens(theme);
  const requestSection = sections.find((section) => section.kind === 'parsed' && section.id === 'request') as ParsedSection | undefined;
  const authInfo = requestSection ? getRequestAuthInfo(requestSection) : null;

  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    '<title>API Integration</title>',
    `<style>
      :root{
        --bg:${tokens.previewBg};
        --panel:${tokens.panel};
        --card:${tokens.card};
        --muted:${tokens.muted};
        --text:${tokens.previewText};
        --accent:${tokens.accentSolid};
        --accent2:${theme === 'dark' ? '#7cf0c8' : '#0ea5a4'};
        --border:${tokens.previewBorder};
        --codebg:${tokens.inputBg};
        --warn:#ffd166;
        --bad:#ff6b6b;
        --good:#7cf0c8;
        --shadow:${tokens.shadow};
        --radius:16px;
        --radius2:12px;
        --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif;
      }
      *{box-sizing:border-box}
      html,body{height:100%}
      html, body { scrollbar-width: thin; scrollbar-color: ${tokens.scrollbarThumb} ${tokens.scrollbarTrack}; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: ${tokens.scrollbarTrack}; }
      ::-webkit-scrollbar-thumb { background: ${tokens.scrollbarThumb}; border-radius: 999px; border: 2px solid ${tokens.scrollbarTrack}; }
      ::-webkit-scrollbar-thumb:hover { background: ${tokens.scrollbarThumbHover}; }
      body{
        margin:0;
        font-family:var(--sans);
        color:var(--text);
        background: radial-gradient(1100px 600px at 20% -10%, color-mix(in srgb, var(--accent) 25%, transparent), transparent 60%),
                    radial-gradient(900px 500px at 90% 0%, color-mix(in srgb, var(--accent2) 18%, transparent), transparent 55%),
                    linear-gradient(180deg, var(--bg), color-mix(in srgb, var(--bg) 70%, #070b14 30%) 70%);
      }
      a{color:var(--accent); text-decoration:none}
      a:hover{text-decoration:none}
      .wrap{max-width:1200px; margin:0 auto; padding:24px 18px 44px}
      header{
        display:flex; gap:16px; align-items:flex-start; justify-content:space-between;
        padding:16px; border:1px solid var(--border); border-radius:var(--radius);
        background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
        box-shadow: var(--shadow);
      }
      .title h1{margin:0 0 4px; font-size:20px; letter-spacing:.2px}
      .title p{margin:0; color:var(--muted); line-height:1.45; font-size:13px}
      .pillrow{display:flex; flex-wrap:wrap; gap:8px; margin-top:10px}
      .pill{
        font-size:12px; padding:6px 10px; border-radius:999px;
        border:1px solid var(--border); background:rgba(255,255,255,.04);
        color:var(--muted);
      }
      .pill strong{color:var(--text); font-weight:600}
      .tools{display:flex; flex-direction:column; gap:10px; min-width:280px; align-items:flex-end}
      .btn{
        border:1px solid var(--border);
        background:rgba(255,255,255,.05);
        color:var(--text);
        padding:8px 12px;
        border-radius:999px;
        font-size:12px;
        cursor:pointer;
      }
      .btn:hover{background:rgba(255,255,255,.08)}
      .layout{display:grid; grid-template-columns: 280px 1fr; gap:16px; margin-top:16px}
      @media (max-width: 980px){
        .layout{grid-template-columns: 1fr}
        .tools{min-width:unset; align-items:flex-start}
      }
      nav{
        position:sticky; top:16px;
        border:1px solid var(--border); border-radius:var(--radius);
        background:rgba(16,31,58,.65);
        backdrop-filter: blur(10px);
        box-shadow: var(--shadow);
        padding:14px;
        height: fit-content;
      }
      nav .navtitle{font-size:13px; color:var(--muted); margin:0 0 10px}
      .navlist{display:flex; flex-direction:column; gap:8px}
      .navitem{
        display:flex; gap:8px; align-items:center;
        padding:9px 10px; border-radius:12px;
        border:1px solid transparent;
        color:var(--text);
      }
      .navitem:hover{border-color: var(--border); background:rgba(255,255,255,.04)}
      .badge{
        font-family:var(--mono);
        font-size:11px;
        padding:3px 6px;
        border-radius:8px;
        border:1px solid var(--border);
        background:rgba(0,0,0,.18);
        color:var(--muted);
        min-width:54px;
        text-align:center;
      }
      main{display:flex; flex-direction:column; gap:14px}
      .card{
        border:1px solid var(--border);
        border-radius:var(--radius);
        background:rgba(16,31,58,.65);
        backdrop-filter: blur(10px);
        box-shadow: var(--shadow);
        overflow:hidden;
      }
      .cardhead{
        padding:14px 16px;
        border-bottom:1px solid var(--border);
        display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
      }
      .methodtitle{display:flex; flex-direction:column; gap:6px}
      .methodtitle h2{margin:0; font-size:17px}
      .methodmeta{display:flex; flex-wrap:wrap; gap:8px; align-items:center}
      .tag{
        font-size:12px; padding:4px 8px; border-radius:999px;
        border:1px solid var(--border);
        background:rgba(0,0,0,.18);
        color:var(--muted);
      }
      .tag.get{border-color: rgba(124,240,200,.35); color: var(--accent2)}
      .tag.post{border-color: rgba(106,166,255,.35); color: var(--accent)}
      .url{
        font-family:var(--mono);
        font-size:12px;
        padding:7px 10px;
        border-radius:12px;
        border:1px dashed rgba(255,255,255,.18);
        background:rgba(0,0,0,.18);
        color:var(--text);
        display:flex; gap:10px; align-items:center;
        max-width: 100%; overflow:auto;
      }
      .section{padding:14px 16px}
      details{
        border:1px solid var(--border);
        background:rgba(0,0,0,.14);
        border-radius:var(--radius2);
        padding:10px 12px;
        margin:10px 0;
      }
      summary{
        cursor:pointer;
        color:var(--text);
        font-weight:600;
        list-style:none;
        display:flex; align-items:center; justify-content:space-between;
      }
      summary::-webkit-details-marker{display:none}
      .sumhint{color:var(--muted); font-weight:500; font-size:12px}
      table{
        width:100%;
        border-collapse: separate;
        border-spacing:0;
        overflow:hidden;
        border:1px solid var(--border);
        border-radius: 12px;
        background:rgba(16,31,58,.35);
        margin-top:10px;
      }
      th, td{
        padding:10px 10px;
        border-bottom:1px solid rgba(255,255,255,.08);
        vertical-align:top;
        font-size:13px;
        line-height:1.35;
      }
      th{
        text-align:left;
        color:var(--muted);
        font-weight:600;
        background:rgba(0,0,0,.18);
      }
      tr:last-child td{border-bottom:0}
      code, pre{ font-family:var(--mono); }
      pre{
        margin:10px 0 0;
        background:var(--codebg);
        border:1px solid rgba(255,255,255,.12);
        border-radius:12px;
        padding:12px 12px;
        overflow:auto;
        position:relative;
        font-size:12px;
        line-height:1.5;
      }
      .pretools{ position:absolute; top:8px; right:8px; display:flex; gap:8px; }
      .smallbtn{
        font-size:11px;
        padding:6px 8px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(255,255,255,.05);
        color:var(--text);
      }
      .note{
        border-left:3px solid rgba(106,166,255,.65);
        background:rgba(106,166,255,.08);
        padding:10px 12px;
        border-radius:12px;
        color:var(--text);
        margin-top:10px;
        font-size:13px;
        line-height:1.45;
      }
      .note.warn{border-left-color: rgba(255,209,102,.8); background:rgba(255,209,102,.08)}
      .note.bad{border-left-color: rgba(255,107,107,.8); background:rgba(255,107,107,.08)}
      .muted{color:var(--muted)}
    </style>`,
    '</head>',
    '<body>',
    '<div class="wrap">',
    '<header>',
    '<div class="title">',
    '<h1>Документация API</h1>',
    '<div class="pillrow">',
    `<span class="pill"><strong>Sections:</strong> ${visibleSections.length}</span>`,
    requestSection ? `<span class="pill"><strong>Auth:</strong> ${escapeHtml(authInfo?.schemeLabel ?? 'None')}</span>` : '',
    requestSection ? `<span class="pill"><strong>Format:</strong> ${escapeHtml(requestSection.format.toUpperCase())}</span>` : '',
    '</div>',
    '</div>',
    '<div class="tools">',
    '<div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end">',
    renderButton('Overview', '#top'),
    visibleSections.find((section) => section.id === 'request') ? renderButton('Request', '#request') : '',
    visibleSections.find((section) => section.id === 'response') ? renderButton('Response', '#response') : '',
    '</div>',
    '</div>',
    '</header>',
    '<div class="layout" id="top">',
    renderSidebar(visibleSections),
    `<main id="content">${blocks.join('')}</main>`,
    '</div>',
    '</div>',
    '</body>',
    '</html>'
  ].join('\n');
}
