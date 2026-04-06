import { getDiagramExportFileName, getDiagramImageUrl, resolveDiagramEngine } from './diagramUtils';
import { buildFlowMermaid } from './flowDiagram';
import { normalizeArrayFieldPath } from './fieldPath';
import { getThemeTokens } from './theme';
import { resolveSectionTitle } from './sectionTitles';
import type { ThemeName } from './theme';
import type { DocSection, MethodDocument, ProjectFlow, ProjectSection } from './types';

type ProjectHtmlExportInput = {
  projectName: string;
  updatedAt: string;
  projectSections: ProjectSection[];
  flows: ProjectFlow[];
  methods: MethodDocument[];
  theme: ThemeName;
  flowImageMap?: Record<string, string>;
  methodDiagramImageMap?: Record<string, string>;
};

type UseCaseRow = {
  step: number;
  actor: string;
  action: string;
  method: string;
  inputs: string;
  outputs: string;
  condition: string;
  result: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeWiki(value: string): string {
  return value.replaceAll('|', '&#124;').replaceAll('{', '&#123;').replaceAll('}', '&#125;');
}

function toWikiCell(value: string): string {
  const normalized = escapeWiki(value).trim();
  return normalized || '&#160;';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function enabledMethodSections(method: MethodDocument): DocSection[] {
  return method.sections.filter((section) => section.enabled);
}

export function getFlowExportFileName(flow: ProjectFlow, index: number, ext: 'svg' | 'jpeg' = 'svg'): string {
  return `flow-${String(index + 1).padStart(2, '0')}-${slugify(flow.name || flow.id)}.${ext}`;
}

function summarizeEdgeMappings(flow: ProjectFlow, nodeId: string): { inputs: string; outputs: string; condition: string } {
  const incoming = flow.edges.filter((edge) => edge.toNodeId === nodeId);
  const outgoing = flow.edges.filter((edge) => edge.fromNodeId === nodeId);

  const inputMappings = incoming.flatMap((edge) => edge.mappings ?? []).map((mapping) => {
    const src = mapping.source.fieldPath || mapping.source.rowId || '';
    const dst = mapping.target.fieldPath || mapping.target.rowId || '';
    return [src, dst].filter(Boolean).join(' -> ');
  });
  const outputMappings = outgoing.flatMap((edge) => edge.mappings ?? []).map((mapping) => {
    const src = mapping.source.fieldPath || mapping.source.rowId || '';
    const dst = mapping.target.fieldPath || mapping.target.rowId || '';
    return [src, dst].filter(Boolean).join(' -> ');
  });
  const conditions = outgoing.map((edge) => edge.condition?.trim() || '').filter(Boolean);

  return {
    inputs: inputMappings.join('; '),
    outputs: outputMappings.join('; '),
    condition: conditions.join(' | ')
  };
}

function buildFlowUseCaseRows(flow: ProjectFlow, methods: MethodDocument[]): UseCaseRow[] {
  const methodById = new Map(methods.map((method) => [method.id, method]));
  const sortedNodes = flow.nodes
    .filter((node) => node.type !== 'note')
    .slice()
    .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);

  return sortedNodes.map((node, index) => {
    const mapping = summarizeEdgeMappings(flow, node.id);
    const methodName = node.type === 'method'
      ? methodById.get(node.methodRef?.methodId ?? '')?.name || ''
      : '';
    return {
      step: index + 1,
      actor: node.actor?.trim() || (node.type === 'start' ? 'Система' : ''),
      action: node.label?.trim() || node.type,
      method: methodName,
      inputs: mapping.inputs,
      outputs: mapping.outputs,
      condition: mapping.condition,
      result: node.description?.trim() || ''
    };
  });
}

function renderSectionHtml(section: DocSection, methodDiagramImageMap?: Record<string, string>): string {
  const title = resolveSectionTitle(section.title);
  if (section.kind === 'text') {
    return [
      `<article class="project-card" id="section-${escapeHtml(section.id)}">`,
      `<h4>${escapeHtml(title)}</h4>`,
      `<div class="project-prose">${escapeHtml(section.value || '').replaceAll('\n', '<br/>') || '<span class="muted">Пусто</span>'}</div>`,
      '</article>'
    ].join('');
  }

  if (section.kind === 'parsed') {
    const rows = section.rows.filter((row) => row.enabled !== false);
    const body = rows.map((row) => (
      `<tr><td>${escapeHtml(normalizeArrayFieldPath(row.field))}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.required)}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.example)}</td></tr>`
    )).join('');
    return [
      `<article class="project-card" id="section-${escapeHtml(section.id)}">`,
      `<h4>${escapeHtml(title)}</h4>`,
      body
        ? `<div class="table-shell"><table><thead><tr><th>Поле</th><th>Тип</th><th>Обяз.</th><th>Описание</th><th>Пример</th></tr></thead><tbody>${body}</tbody></table></div>`
        : '<p class="muted">Нет строк.</p>',
      '</article>'
    ].join('');
  }

  if (section.kind === 'diagram') {
    const diagrams = section.diagrams.filter((diagram) => diagram.code.trim());
    const items = diagrams.map((diagram, index) => {
      const fileName = getDiagramExportFileName(title, section.id, diagram.title, index, 'svg');
      const embedded = methodDiagramImageMap?.[fileName] || '';
      const remote = getDiagramImageUrl(resolveDiagramEngine(diagram.code, diagram.engine), diagram.code, 'svg');
      return [
        '<div class="project-diagram">',
        `<h5>${escapeHtml(diagram.title || `Диаграмма ${index + 1}`)}</h5>`,
        `<img src="${escapeHtml(embedded || remote)}" alt="${escapeHtml(diagram.title || `diagram-${index + 1}`)}" loading="lazy"/>`,
        '</div>'
      ].join('');
    }).join('');

    return [
      `<article class="project-card" id="section-${escapeHtml(section.id)}">`,
      `<h4>${escapeHtml(title)}</h4>`,
      items || '<p class="muted">Нет диаграмм.</p>',
      '</article>'
    ].join('');
  }

  const rows = section.rows;
  const body = rows.map((row, index) => (
    `<tr><td>${index + 1}</td><td>${escapeHtml(row.clientHttpStatus)}</td><td>${escapeHtml(row.trigger)}</td><td>${escapeHtml(row.errorType)}</td><td>${escapeHtml(row.serverHttpStatus)}</td><td>${escapeHtml(row.internalCode)}</td></tr>`
  )).join('');
  return [
    `<article class="project-card" id="section-${escapeHtml(section.id)}">`,
    `<h4>${escapeHtml(title)}</h4>`,
    body
      ? `<div class="table-shell"><table><thead><tr><th>#</th><th>Client HTTP</th><th>Trigger</th><th>Error type</th><th>Server HTTP</th><th>Code</th></tr></thead><tbody>${body}</tbody></table></div>`
      : '<p class="muted">Нет ошибок.</p>',
    '</article>'
  ].join('');
}

function renderMethodHtml(method: MethodDocument, methodDiagramImageMap?: Record<string, string>): string {
  const enabled = enabledMethodSections(method);
  const sections = enabled.map((section) => renderSectionHtml(section, methodDiagramImageMap)).join('');
  return [
    `<section class="method-block" id="method-${escapeHtml(method.id)}">`,
    `<h3>${escapeHtml(method.name)}</h3>`,
    sections || '<p class="muted">Нет активных секций.</p>',
    '</section>'
  ].join('');
}

export function renderProjectHtmlDocument(input: ProjectHtmlExportInput): string {
  const tokens = getThemeTokens(input.theme);
  const enabledProjectSections = input.projectSections.filter((section) => section.enabled);
  const enabledMethods = input.methods.map((method) => ({
    ...method,
    sections: enabledMethodSections(method)
  })).filter((method) => method.sections.length > 0);
  const flows = input.flows;
  const tocItems = [
    '<li><a href="#project-overview">О проекте</a></li>',
    '<li><a href="#project-docs">Project Docs</a></li>',
    '<li><a href="#project-flows">Flows</a></li>',
    '<li><a href="#project-methods">Методы</a></li>',
    ...enabledMethods.map((method) => `<li><a href="#method-${escapeHtml(method.id)}">${escapeHtml(method.name)}</a></li>`)
  ].join('');

  const flowBlocks = flows.map((flow, index) => {
    const fileName = getFlowExportFileName(flow, index, 'svg');
    const image = input.flowImageMap?.[fileName] || getDiagramImageUrl('mermaid', buildFlowMermaid(flow, input.methods), 'svg');
    const rows = buildFlowUseCaseRows(flow, input.methods);
    const tableRows = rows.map((row) => (
      `<tr><td>${row.step}</td><td>${escapeHtml(row.actor)}</td><td>${escapeHtml(row.action)}</td><td>${escapeHtml(row.method)}</td><td>${escapeHtml(row.inputs)}</td><td>${escapeHtml(row.outputs)}</td><td>${escapeHtml(row.condition)}</td><td>${escapeHtml(row.result)}</td></tr>`
    )).join('');
    return [
      `<article class="project-card" id="flow-${escapeHtml(flow.id)}">`,
      `<h4>${escapeHtml(flow.name)}</h4>`,
      `<img class="flow-image" src="${escapeHtml(image)}" alt="${escapeHtml(flow.name)}" loading="lazy"/>`,
      '<div class="table-shell"><table><thead><tr><th>Шаг</th><th>Актор</th><th>Действие</th><th>Метод</th><th>Вход</th><th>Выход</th><th>Условие</th><th>Результат</th></tr></thead>',
      `<tbody>${tableRows}</tbody></table></div>`,
      '</article>'
    ].join('');
  }).join('');

  const projectDocs = enabledProjectSections
    .sort((a, b) => a.order - b.order)
    .map((section) => (
      `<article class="project-card" id="project-doc-${escapeHtml(section.id)}"><h4>${escapeHtml(section.title)}</h4><div class="project-prose">${escapeHtml(section.content).replaceAll('\n', '<br/>') || '<span class="muted">Пусто</span>'}</div></article>`
    ))
    .join('');

  const methodsHtml = enabledMethods.map((method) => renderMethodHtml(method, input.methodDiagramImageMap)).join('');

  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    `<title>${escapeHtml(input.projectName)}. full documentation</title>`,
    `<style>
      :root{--bg:${tokens.bg};--panel:${tokens.panel};--card:${tokens.card};--text:${tokens.previewText};--muted:${tokens.muted};--border:${tokens.border};--accent:${tokens.accentSolid};}
      body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);}
      .layout{display:grid;grid-template-columns:18rem 1fr;gap:1rem;padding:1rem;min-height:100vh}
      .sidebar{position:sticky;top:1rem;height:calc(100vh - 2rem);overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:1rem}
      .sidebar h2{font-size:1rem;margin:0 0 .5rem}
      .sidebar ul{margin:0;padding-left:1rem}
      .sidebar li{margin:.25rem 0}
      .content{display:flex;flex-direction:column;gap:1rem}
      .section{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:1rem}
      .project-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:.75rem;margin-bottom:.75rem}
      .project-card h4{margin:.1rem 0 .5rem}
      .method-block{margin-bottom:1rem}
      .table-shell{overflow:auto}
      table{border-collapse:collapse;width:100%;font-size:.86rem}
      th,td{border:1px solid var(--border);padding:.4rem;vertical-align:top;text-align:left}
      th{background:color-mix(in srgb,var(--panel) 75%, var(--card))}
      .muted{color:var(--muted)}
      .flow-image{display:block;max-width:100%;height:auto;border:1px solid var(--border);border-radius:8px;background:white;margin-bottom:.75rem}
      @media (max-width: 960px){.layout{grid-template-columns:1fr}.sidebar{position:static;height:auto}}
    </style>`,
    '</head>',
    '<body>',
    '<div class="layout">',
    `<aside class="sidebar"><h2>${escapeHtml(input.projectName)}</h2><ul>${tocItems}</ul></aside>`,
    '<main class="content">',
    `<section class="section" id="project-overview"><h1>${escapeHtml(input.projectName)}</h1><p>Обновлено: ${escapeHtml(new Date(input.updatedAt).toLocaleString())}</p></section>`,
    `<section class="section" id="project-docs"><h2>Project Docs</h2>${projectDocs || '<p class="muted">Нет активных секций проекта.</p>'}</section>`,
    `<section class="section" id="project-flows"><h2>Flows</h2>${flowBlocks || '<p class="muted">Flow не настроены.</p>'}</section>`,
    `<section class="section" id="project-methods"><h2>Методы</h2>${methodsHtml || '<p class="muted">Нет активных секций методов.</p>'}</section>`,
    '</main>',
    '</div>',
    '</body>',
    '</html>'
  ].join('\n');
}

export function renderProjectWikiDocument(params: {
  projectName: string;
  updatedAt: string;
  projectSections: ProjectSection[];
  flows: ProjectFlow[];
  methods: MethodDocument[];
}): string {
  const lines: string[] = [
    '{toc}',
    '',
    `h1. ${escapeWiki(params.projectName)}`,
    `*Обновлено:* ${escapeWiki(new Date(params.updatedAt).toLocaleString())}`,
    '',
    'h2. Project Docs'
  ];

  const docs = params.projectSections.filter((section) => section.enabled).sort((a, b) => a.order - b.order);
  if (docs.length === 0) {
    lines.push('_Нет активных проектных секций_');
  } else {
    for (const section of docs) {
      lines.push('');
      lines.push(`h3. ${escapeWiki(section.title)}`);
      lines.push(...(section.content.trim() ? section.content.split(/\r?\n/).map((line) => escapeWiki(line)) : ['_Пусто_']));
    }
  }

  lines.push('');
  lines.push('h2. Use Case сценарии');

  for (const [flowIndex, flow] of params.flows.entries()) {
    const mermaidCode = buildFlowMermaid(flow, params.methods);
    const imageUrl = getDiagramImageUrl('mermaid', mermaidCode, 'svg');
    const rows = buildFlowUseCaseRows(flow, params.methods);

    lines.push('');
    lines.push(`h3. ${escapeWiki(flow.name || `Flow ${flowIndex + 1}`)}`);
    lines.push(`!${escapeWiki(imageUrl)}!`);
    lines.push('');
    lines.push('||Шаг||Актор||Действие||Метод||Входные данные||Выходные данные||Условие||Результат||');
    for (const row of rows) {
      lines.push(
        `|${toWikiCell(String(row.step))}|${toWikiCell(row.actor)}|${toWikiCell(row.action)}|${toWikiCell(row.method)}|${toWikiCell(row.inputs)}|${toWikiCell(row.outputs)}|${toWikiCell(row.condition)}|${toWikiCell(row.result)}|`
      );
    }
  }

  return lines.join('\n');
}
