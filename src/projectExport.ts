import { getDiagramExportFileName, getDiagramImageUrl, resolveDiagramEngine } from './diagramUtils';
import { buildFlowMermaid } from './flowDiagram';
import { normalizeArrayFieldPath } from './fieldPath';
import { getThemeTokens } from './theme';
import { resolveSectionTitle } from './sectionTitles';
import { renderWikiDocument } from './renderWiki';
import type { ThemeName } from './theme';
import type { DocSection, MethodDocument, MethodGroup, ProjectFlow, ProjectSection } from './types';

export type ProjectExportDetailMode = 'full' | 'brief';

type ProjectHtmlExportInput = {
  projectName: string;
  updatedAt: string;
  projectSections: ProjectSection[];
  flows: ProjectFlow[];
  methods: MethodDocument[];
  groups: MethodGroup[];
  theme: ThemeName;
  detailMode?: ProjectExportDetailMode;
  flowImageMap?: Record<string, string>;
  methodDiagramImageMap?: Record<string, string>;
};

type ProjectMethodTreeGroup = {
  id: string;
  name: string;
  methods: MethodDocument[];
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

function getMethodAnchor(method: MethodDocument): string {
  return `method-${method.id}`;
}

function getMethodGroupAnchor(group: { id: string }): string {
  return `method-group-${group.id}`;
}

function getMethodSectionAnchor(method: MethodDocument, section: DocSection): string {
  return `${getMethodAnchor(method)}-section-${section.id}`;
}

function getProjectMethodTree(methods: MethodDocument[], groups: MethodGroup[]): ProjectMethodTreeGroup[] {
  const byId = new Map(methods.map((method) => [method.id, method]));
  const used = new Set<string>();
  const tree: ProjectMethodTreeGroup[] = [];

  for (const group of groups) {
    const groupMethods: MethodDocument[] = [];
    for (const methodId of group.methodIds) {
      if (used.has(methodId)) continue;
      const method = byId.get(methodId);
      if (!method) continue;
      used.add(methodId);
      groupMethods.push(method);
    }
    if (groupMethods.length > 0) {
      tree.push({ id: group.id, name: group.name, methods: groupMethods });
    }
  }

  const ungrouped = methods.filter((method) => !used.has(method.id));
  if (ungrouped.length > 0) {
    tree.push({ id: 'ungrouped', name: 'Methods', methods: ungrouped });
  }

  return tree;
}

function renderProjectSectionHtml(section: ProjectSection): string {
  if (section.type === 'diagram') {
    const code = section.diagramCode?.trim() ?? '';
    const caption = section.content.trim()
      ? `<p class="project-prose">${escapeHtml(section.content).replaceAll('\n', '<br/>')}</p>`
      : '';
    const image = code
      ? `<img class="flow-image" src="${escapeHtml(getDiagramImageUrl(resolveDiagramEngine(code, section.diagramEngine ?? 'mermaid'), code, 'svg'))}" alt="${escapeHtml(section.title)}" loading="lazy"/>`
      : '<p class="muted">Пусто</p>';
    return [
      `<article class="project-card" id="project-doc-${escapeHtml(section.id)}">`,
      `<h4>${escapeHtml(section.title)}</h4>`,
      image,
      caption,
      '</article>'
    ].join('');
  }

  return [
    `<article class="project-card" id="project-doc-${escapeHtml(section.id)}">`,
    `<h4>${escapeHtml(section.title)}</h4>`,
    `<div class="project-prose">${escapeHtml(section.content).replaceAll('\n', '<br/>') || '<span class="muted">Пусто</span>'}</div>`,
    '</article>'
  ].join('');
}

function pushProjectSectionWiki(lines: string[], section: ProjectSection): void {
  lines.push('');
  lines.push(`h3. ${escapeWiki(section.title)}`);

  if (section.type === 'diagram') {
    const code = section.diagramCode?.trim() ?? '';
    if (code) {
      const imageUrl = getDiagramImageUrl(resolveDiagramEngine(code, section.diagramEngine ?? 'mermaid'), code, 'svg');
      lines.push(`!${escapeWiki(imageUrl)}!`);
      if (section.content.trim()) {
        lines.push('');
        lines.push(...section.content.split(/\r?\n/).map((line) => escapeWiki(line)));
      }
    } else {
      lines.push('_Пусто_');
    }
    return;
  }

  lines.push(...(section.content.trim() ? section.content.split(/\r?\n/).map((line) => escapeWiki(line)) : ['_Пусто_']));
}

function getMethodStatusLabel(status: MethodDocument['status']): string {
  if (status === 'review') return 'На ревью';
  if (status === 'done') return 'Готово';
  return 'Черновик';
}

function getMethodRequestLine(method: MethodDocument): { httpMethod?: string; path?: string } {
  const request = method.sections.find((section) => section.kind === 'parsed' && section.sectionType === 'request');
  if (!request || request.kind !== 'parsed') return {};
  return {
    httpMethod: request.requestMethod,
    path: request.requestUrl
  };
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

function renderSectionHtml(section: DocSection, methodDiagramImageMap?: Record<string, string>, method?: MethodDocument): string {
  const title = resolveSectionTitle(section.title);
  const sectionAnchor = method ? getMethodSectionAnchor(method, section) : `section-${section.id}`;
  if (section.kind === 'text') {
    return [
      `<article class="project-card" id="${escapeHtml(sectionAnchor)}">`,
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
      `<article class="project-card" id="${escapeHtml(sectionAnchor)}">`,
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
      `<article class="project-card" id="${escapeHtml(sectionAnchor)}">`,
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
    `<article class="project-card" id="${escapeHtml(sectionAnchor)}">`,
    `<h4>${escapeHtml(title)}</h4>`,
    body
      ? `<div class="table-shell"><table><thead><tr><th>#</th><th>Client HTTP</th><th>Trigger</th><th>Error type</th><th>Server HTTP</th><th>Code</th></tr></thead><tbody>${body}</tbody></table></div>`
      : '<p class="muted">Нет ошибок.</p>',
    '</article>'
  ].join('');
}

function renderMethodSummaryHtml(method: MethodDocument): string {
  const requestLine = getMethodRequestLine(method);
  const meta: Array<{ label: string; value: string }> = [
    { label: 'Статус', value: getMethodStatusLabel(method.status) }
  ];
  if (requestLine.httpMethod || requestLine.path) {
    meta.push({ label: 'Endpoint', value: [requestLine.httpMethod, requestLine.path].filter(Boolean).join(' ') });
  }
  if (method.jiraTicket) meta.push({ label: 'Jira', value: method.jiraTicket });
  if (method.epic) meta.push({ label: 'Epic', value: method.epic });
  if (method.responsible) meta.push({ label: 'Ответственный', value: method.responsible });

  return [
    '<dl class="method-meta">',
    ...meta.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`),
    '</dl>'
  ].join('');
}

function renderMethodHtml(
  method: MethodDocument,
  methodDiagramImageMap?: Record<string, string>,
  detailMode: ProjectExportDetailMode = 'full'
): string {
  const enabled = enabledMethodSections(method);
  const body = detailMode === 'brief'
    ? renderMethodSummaryHtml(method)
    : enabled.map((section) => renderSectionHtml(section, methodDiagramImageMap, method)).join('');
  return [
    `<section class="method-block" id="${escapeHtml(getMethodAnchor(method))}">`,
    `<h3>${escapeHtml(method.name)}</h3>`,
    body || '<p class="muted">Нет активных секций.</p>',
    '</section>'
  ].join('');
}

function renderMethodGroupHtml(
  group: ProjectMethodTreeGroup,
  methodDiagramImageMap?: Record<string, string>,
  detailMode: ProjectExportDetailMode = 'full'
): string {
  return [
    `<section class="method-group-block" id="${escapeHtml(getMethodGroupAnchor(group))}">`,
    `<h3>${escapeHtml(group.name)}</h3>`,
    group.methods.map((method) => renderMethodHtml(method, methodDiagramImageMap, detailMode)).join(''),
    '</section>'
  ].join('');
}

function renderProjectHtmlNav(
  projectSections: ProjectSection[],
  flows: ProjectFlow[],
  methodTree: ProjectMethodTreeGroup[],
  detailMode: ProjectExportDetailMode
): string {
  const projectDocsNav = projectSections
    .map((section) => `<li><a href="#project-doc-${escapeHtml(section.id)}">${escapeHtml(section.title)}</a></li>`)
    .join('');
  const flowsNav = flows
    .map((flow) => `<li><a href="#flow-${escapeHtml(flow.id)}">${escapeHtml(flow.name)}</a></li>`)
    .join('');
  const methodsNav = methodTree
    .map((group) => {
      const groupMethods = group.methods
        .map((method) => {
          const sections = detailMode === 'brief'
            ? ''
            : enabledMethodSections(method)
              .map((section) => `<li><a href="#${escapeHtml(getMethodSectionAnchor(method, section))}">${escapeHtml(resolveSectionTitle(section.title))}</a></li>`)
              .join('');
          return [
            `<li><a href="#${escapeHtml(getMethodAnchor(method))}">${escapeHtml(method.name)}</a>`,
            sections ? `<ul class="nav-level-3">${sections}</ul>` : '',
            '</li>'
          ].join('');
        })
        .join('');
      return [
        `<li><a href="#${escapeHtml(getMethodGroupAnchor(group))}">${escapeHtml(group.name)}</a>`,
        groupMethods ? `<ul class="nav-level-2">${groupMethods}</ul>` : '',
        '</li>'
      ].join('');
    })
    .join('');

  return [
    '<nav class="sidebar-nav" aria-label="Навигация по проекту">',
    '<ul>',
    '<li><a href="#project-overview">О проекте</a></li>',
    '<li><a href="#project-docs">Project Docs</a>',
    projectDocsNav ? `<ul class="nav-level-1">${projectDocsNav}</ul>` : '',
    '</li>',
    '<li><a href="#project-flows">Flows</a>',
    flowsNav ? `<ul class="nav-level-1">${flowsNav}</ul>` : '',
    '</li>',
    '<li><a href="#project-methods">Методы</a>',
    methodsNav ? `<ul class="nav-level-1">${methodsNav}</ul>` : '',
    '</li>',
    '</ul>',
    '</nav>'
  ].join('');
}

export function renderProjectHtmlDocument(input: ProjectHtmlExportInput): string {
  const tokens = getThemeTokens(input.theme);
  const detailMode = input.detailMode ?? 'full';
  const enabledProjectSections = input.projectSections.filter((section) => section.enabled);
  const enabledMethods = input.methods.map((method) => ({
    ...method,
    sections: enabledMethodSections(method)
  })).filter((method) => detailMode === 'brief' || method.sections.length > 0);
  const flows = input.flows;
  const methodTree = getProjectMethodTree(enabledMethods, input.groups);
  const sortedProjectSections = enabledProjectSections.slice().sort((a, b) => a.order - b.order);
  const projectNav = renderProjectHtmlNav(sortedProjectSections, flows, methodTree, detailMode);

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

  const projectDocs = sortedProjectSections
    .map((section) => renderProjectSectionHtml(section))
    .join('');

  const methodsHtml = methodTree.map((group) => renderMethodGroupHtml(group, input.methodDiagramImageMap, detailMode)).join('');

  return [
    '<!doctype html>',
    '<html lang="ru">',
    '<head>',
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    `<title>${escapeHtml(input.projectName)}. ${detailMode === 'brief' ? 'brief' : 'full'} documentation</title>`,
    `<style>
      :root{--bg:${tokens.bg};--panel:${tokens.panel};--card:${tokens.card};--text:${tokens.previewText};--muted:${tokens.muted};--border:${tokens.border};--accent:${tokens.accentSolid};}
      body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text);}
      .layout{display:grid;grid-template-columns:18rem 1fr;gap:1rem;padding:1rem;min-height:100vh}
      .sidebar{position:sticky;top:1rem;height:calc(100vh - 2rem);overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:1rem}
      .sidebar h2{font-size:1rem;margin:0 0 .5rem}
      .sidebar-nav ul{list-style:none;margin:0;padding:0}
      .sidebar-nav li{margin:.15rem 0}
      .sidebar-nav a{display:block;padding:.2rem .35rem;border-radius:6px;color:var(--text);text-decoration:none}
      .sidebar-nav a:hover,.sidebar-nav a:focus{background:var(--card);outline:none}
      .sidebar-nav .nav-level-1{padding-left:.65rem}
      .sidebar-nav .nav-level-2{padding-left:1rem;font-size:.9rem}
      .sidebar-nav .nav-level-3{padding-left:1rem;font-size:.82rem;color:var(--muted)}
      .content{display:flex;flex-direction:column;gap:1rem}
      .section{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:1rem}
      .project-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:.75rem;margin-bottom:.75rem}
      .project-card h4{margin:.1rem 0 .5rem}
      .method-block{margin-bottom:1rem}
      .method-group-block{margin-bottom:1.25rem}
      .method-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.45rem;margin:.4rem 0 0}
      .method-meta div{border:1px solid var(--border);border-radius:8px;padding:.45rem .55rem;background:color-mix(in srgb,var(--panel) 70%, var(--card))}
      .method-meta dt{font-size:.72rem;color:var(--muted);margin:0 0 .15rem}
      .method-meta dd{margin:0;font-weight:600}
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
    `<aside class="sidebar"><h2>${escapeHtml(input.projectName)}</h2>${projectNav}</aside>`,
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
  detailMode?: ProjectExportDetailMode;
}): string {
  const detailMode = params.detailMode ?? 'full';
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
      pushProjectSectionWiki(lines, section);
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

  lines.push('');
  lines.push('h2. Методы');

  const enabledMethods = params.methods.map((method) => ({
    ...method,
    sections: enabledMethodSections(method)
  })).filter((method) => detailMode === 'brief' || method.sections.length > 0);

  if (enabledMethods.length === 0) {
    lines.push('_Нет активных секций методов_');
  } else {
    for (const method of enabledMethods) {
      lines.push('');
      lines.push(`h3. ${escapeWiki(method.name)}`);

      const methodMeta: string[] = [];
      if (method.jiraTicket) methodMeta.push(`*Jira:* ${escapeWiki(method.jiraTicket)}`);
      if (method.epic) methodMeta.push(`*Epic:* ${escapeWiki(method.epic)}`);
      if (method.responsible) methodMeta.push(`*Ответственный:* ${escapeWiki(method.responsible)}`);
      methodMeta.push(`*Статус:* ${escapeWiki(getMethodStatusLabel(method.status))}`);
      lines.push(methodMeta.join(' • '));

      if (detailMode === 'brief') {
        continue;
      }

      const requestLine = getMethodRequestLine(method);
      const methodWiki = renderWikiDocument(
        method.sections,
        {
          httpMethod: requestLine.httpMethod,
          path: requestLine.path,
          jiraTicket: method.jiraTicket,
          epic: method.epic,
          initiators: method.initiators,
          responsible: method.responsible,
          externalUrl: method.externalUrl,
          updatedAt: method.updatedAt
        },
        {
          includeToc: false,
          includeTemplateIntro: false,
          headingOffset: 2
        }
      );
      if (methodWiki.trim()) {
        lines.push(methodWiki);
      }
    }
  }

  return lines.join('\n');
}
