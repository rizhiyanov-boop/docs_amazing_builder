import { ERROR_CATALOG_BY_CODE } from './errorCatalog';
import { parseToRows, wrapNonDomainResponseJson } from './parsers';
import { sanitizeSections } from './sectionTitles';
import { withSectionRowIds } from './sectionHelpers';
import { createInitialSections } from './sectionFactories';
import type {
  DocSection,
  MethodDocument,
  MethodGroup,
  ProjectData,
  ProjectFlow,
  ProjectSection,
  WorkspaceProjectData
} from './types';

const DEFAULT_METHOD_NAME = 'Метод 1';
const DEFAULT_PROJECT_NAME = 'Новый проект';

function normalizeProjectName(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_PROJECT_NAME;
}

export function createProjectSectionId(): string {
  return `project-section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createFlowId(): string {
  return `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createFlowNodeId(prefix = 'node'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultProjectSections(): ProjectSection[] {
  return [
    {
      id: createProjectSectionId(),
      title: 'Overview',
      enabled: true,
      type: 'markdown',
      content: '',
      order: 0
    },
    {
      id: createProjectSectionId(),
      title: 'Business Rules',
      enabled: true,
      type: 'text',
      content: '',
      order: 1
    }
  ];
}

export function createDefaultFlow(methodId?: string): ProjectFlow {
  const startId = createFlowNodeId('start');
  const methodNodeId = createFlowNodeId('method');
  const endId = createFlowNodeId('end');
  const nodes = [
    {
      id: startId,
      type: 'start' as const,
      position: { x: 80, y: 180 },
      label: 'Start'
    },
    {
      id: methodNodeId,
      type: 'method' as const,
      position: { x: 340, y: 180 },
      label: 'Method',
      methodRef: methodId ? { methodId } : undefined
    },
    {
      id: endId,
      type: 'end' as const,
      position: { x: 600, y: 180 },
      label: 'End'
    }
  ];
  return {
    id: createFlowId(),
    name: 'Основной сценарий',
    description: '',
    nodes,
    edges: [
      {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'sequence',
        fromNodeId: startId,
        toNodeId: methodNodeId,
        mappings: []
      },
      {
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'sequence',
        fromNodeId: methodNodeId,
        toNodeId: endId,
        mappings: []
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function sanitizeProjectSections(rawSections: ProjectSection[] | undefined): ProjectSection[] {
  if (!Array.isArray(rawSections)) return createDefaultProjectSections();
  const sections = rawSections
    .filter(Boolean)
    .map((section, index) => ({
      id: section.id || createProjectSectionId(),
      title: section.title?.trim() || `Раздел ${index + 1}`,
      enabled: section.enabled ?? true,
      type: section.type ?? 'text',
      content: section.content ?? '',
      order: Number.isFinite(section.order) ? section.order : index
    }))
    .sort((left, right) => left.order - right.order)
    .map((section, index) => ({ ...section, order: index }));
  return sections.length > 0 ? sections : createDefaultProjectSections();
}

export function sanitizeProjectFlows(rawFlows: ProjectFlow[] | undefined, methods: MethodDocument[]): ProjectFlow[] {
  if (!Array.isArray(rawFlows) || rawFlows.length === 0) {
    return [createDefaultFlow(methods[0]?.id)];
  }

  const sanitized = rawFlows
    .filter(Boolean)
    .map((flow, index) => ({
      id: flow.id || createFlowId(),
      name: flow.name?.trim() || `Flow ${index + 1}`,
      description: flow.description ?? '',
      nodes: Array.isArray(flow.nodes)
        ? flow.nodes.map((node, nodeIndex) => ({
            id: node.id || createFlowNodeId(`node-${nodeIndex + 1}`),
            type: node.type ?? 'note',
            position: {
              x: Number.isFinite(node.position?.x) ? node.position.x : 80 + nodeIndex * 80,
              y: Number.isFinite(node.position?.y) ? node.position.y : 120
            },
            label: node.label ?? '',
            description: node.description ?? '',
            actor: node.actor ?? '',
            methodRef: node.methodRef,
            noteContent: node.noteContent ?? '',
            preconditions: Array.isArray(node.preconditions) ? node.preconditions : [],
            postconditions: Array.isArray(node.postconditions) ? node.postconditions : []
          }))
        : [],
      edges: Array.isArray(flow.edges)
        ? flow.edges.map((edge) => ({
            id: edge.id || `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'sequence' as const,
            fromNodeId: edge.fromNodeId,
            toNodeId: edge.toNodeId,
            label: edge.label ?? '',
            condition: edge.condition ?? '',
            mappings: Array.isArray(edge.mappings) ? edge.mappings : []
          }))
        : [],
      createdAt: flow.createdAt || new Date().toISOString(),
      updatedAt: flow.updatedAt || new Date().toISOString()
    }));

  return sanitized.length > 0 ? sanitized : [createDefaultFlow(methods[0]?.id)];
}

export function createMethodId(): string {
  return `method-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createMethodDocument(
  name = DEFAULT_METHOD_NAME,
  sections: DocSection[] = createInitialSections(),
  id = createMethodId()
): MethodDocument {
  return {
    id,
    name,
    updatedAt: new Date().toISOString(),
    sections
  };
}

export function createWorkspaceSeed(): WorkspaceProjectData {
  const method = createMethodDocument();
  return {
    version: 3,
    projectName: DEFAULT_PROJECT_NAME,
    updatedAt: new Date().toISOString(),
    activeMethodId: method.id,
    methods: [method],
    groups: [],
    projectSections: createDefaultProjectSections(),
    flows: [createDefaultFlow(method.id)]
  };
}

export function createOnboardingDemoWorkspace(): WorkspaceProjectData {
  const demoRequestInput = [
    "curl --request POST 'https://api.demo.local/v1/payments/transfer' ",
    "--header 'Authorization: Bearer <token>' ",
    "--header 'Content-Type: application/json' ",
    "--data '{",
    '  "senderAccount": "40817810000000000123",',
    '  "receiverAccount": "40817810000000000999",',
    '  "amount": 150000,',
    '  "currency": "UZS",',
    '  "comment": "Оплата по договору 42"',
    "}'"
  ].join(' ');

  const demoResponseInput = JSON.stringify(
    {
      transferId: 'trf-20260319-0001',
      status: 'ACCEPTED',
      createdAt: '2026-03-19T08:15:00Z',
      fee: {
        amount: 2500,
        currency: 'UZS'
      }
    },
    null,
    2
  );

  const baseSections = createInitialSections();
  const demoSections: DocSection[] = baseSections.map((section): DocSection => {
    if (section.kind === 'text' && section.id === 'goal') {
      return {
        ...section,
        value:
          'Документация описывает перевод между счетами внутри банка через REST endpoint.\n\nЦель: показать контракт запроса и ответа для интеграции клиентских систем.'
      };
    }

    if (section.kind === 'text' && section.id === 'functional') {
      return {
        ...section,
        value:
          '1. Проверка авторизации и прав на списание.\n2. Валидация суммы и валюты.\n3. Создание транзакции и возврат transferId.'
      };
    }

    if (section.kind === 'parsed' && section.sectionType === 'request') {
      const serverRows = parseToRows('curl', demoRequestInput);
      return {
        ...section,
        format: 'curl' as const,
        lastSyncedFormat: 'curl' as const,
        input: demoRequestInput,
        rows: serverRows,
        error: '',
        requestUrl: 'https://api.demo.local/v1/payments/transfer',
        requestMethod: 'POST' as const
      };
    }

    if (section.kind === 'parsed' && section.sectionType === 'response') {
      const wrappedInput = section.domainModelEnabled ? demoResponseInput : wrapNonDomainResponseJson(demoResponseInput);
      const serverRows = parseToRows('json', wrappedInput);
      return {
        ...section,
        format: 'json' as const,
        lastSyncedFormat: 'json' as const,
        input: wrappedInput,
        rows: serverRows,
        error: ''
      };
    }

    if (section.kind === 'diagram') {
      return {
        ...section,
        diagrams: [
          {
            ...section.diagrams[0],
            title: 'Основной поток перевода',
            engine: 'mermaid',
            code: [
              'sequenceDiagram',
              'participant Client',
              'participant API',
              'participant Core',
              'Client->>API: POST /payments/transfer',
              'API->>Core: Validate and reserve funds',
              'Core-->>API: transfer created',
              'API-->>Client: 200 ACCEPTED + transferId'
            ].join('\n'),
            description: 'Базовый happy-path: запрос, проверка, создание перевода, подтверждение клиенту.'
          }
        ]
      };
    }

    if (section.kind === 'errors') {
      return {
        ...section,
        rows: [
          {
            clientHttpStatus: '400',
            clientResponse: 'Некорректная сумма перевода',
            clientResponseCode: '{"code":"VAL_001","message":"Invalid amount"}',
            trigger: 'Сумма <= 0 или превышен лимит клиента',
            errorType: 'BusinessException',
            serverHttpStatus: '422',
            internalCode: '100101',
            message: ERROR_CATALOG_BY_CODE.get('100101')?.message ?? 'Bad request sent to the system',
            responseCode: '{"code":"100101","message":"Bad request sent to the system"}'
          }
        ],
        validationRules: [
          {
            parameter: 'amount',
            validationCase: 'max/min',
            condition: 'amount > 0 and amount <= dailyLimit',
            cause: 'Ограничения тарифа и антифрод политики'
          }
        ]
      };
    }

    return section;
  });

  const method = createMethodDocument('Демо: Перевод между счетами', demoSections);
  return {
    version: 3,
    projectName: 'Демо проект',
    updatedAt: new Date().toISOString(),
    activeMethodId: method.id,
    methods: [method],
    groups: [],
    projectSections: createDefaultProjectSections(),
    flows: [createDefaultFlow(method.id)]
  };
}

export function normalizeWorkspaceForMode(workspace: WorkspaceProjectData, enableMultiMethods: boolean): WorkspaceProjectData {
  if (enableMultiMethods) {
    return {
      ...workspace,
      projectSections: sanitizeProjectSections(workspace.projectSections),
      flows: sanitizeProjectFlows(workspace.flows, workspace.methods)
    };
  }

  const resolvedMethod = workspace.methods.find((method) => method.id === workspace.activeMethodId) ?? workspace.methods[0] ?? createMethodDocument();
  return {
    ...workspace,
    projectName: normalizeProjectName(workspace.projectName),
    activeMethodId: resolvedMethod.id,
    methods: [resolvedMethod],
    groups: [],
    projectSections: sanitizeProjectSections(workspace.projectSections),
    flows: sanitizeProjectFlows(workspace.flows, [resolvedMethod])
  };
}

export function asWorkspaceProjectData(
  projectName: string,
  methods: MethodDocument[],
  activeMethodId: string,
  groups: MethodGroup[] = [],
  projectSections: ProjectSection[] = createDefaultProjectSections(),
  flows: ProjectFlow[] = [createDefaultFlow(methods[0]?.id)],
  enableMultiMethods = true
): WorkspaceProjectData {
  const normalizedMethods = methods.length > 0 ? methods : [createMethodDocument()];
  const resolvedActiveMethodId = normalizedMethods.some((method) => method.id === activeMethodId)
    ? activeMethodId
    : normalizedMethods[0].id;

  const workspace: WorkspaceProjectData = {
    version: 3,
    projectName: normalizeProjectName(projectName),
    updatedAt: new Date().toISOString(),
    activeMethodId: resolvedActiveMethodId,
    methods: normalizedMethods.map((method) => ({
      ...method,
      updatedAt: method.updatedAt || new Date().toISOString(),
      sections: sanitizeSections(method.sections).map(withSectionRowIds)
    })),
    groups,
    projectSections: sanitizeProjectSections(projectSections),
    flows: sanitizeProjectFlows(flows, normalizedMethods)
  };

  return normalizeWorkspaceForMode(workspace, enableMultiMethods);
}

export function loadWorkspaceProject(storageKey: string, enableMultiMethods: boolean): WorkspaceProjectData {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return createWorkspaceSeed();
    const parsed = JSON.parse(raw) as WorkspaceProjectData | ProjectData;

    if ('methods' in parsed && Array.isArray(parsed.methods)) {
      const sanitizedMethods = parsed.methods
        .filter((method) => method && Array.isArray(method.sections))
        .map((method, index) => ({
          id: method.id || createMethodId(),
          name: method.name?.trim() || `Метод ${index + 1}`,
          updatedAt: method.updatedAt || new Date().toISOString(),
          sections: sanitizeSections(method.sections).map(withSectionRowIds)
        }));

      if (sanitizedMethods.length === 0) return createWorkspaceSeed();

      const groups = Array.isArray(parsed.groups)
        ? parsed.groups.map((group) => ({
            id: group.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: group.name?.trim() || 'Новая цепочка',
            methodIds: Array.isArray(group.methodIds) ? group.methodIds.filter(Boolean) : [],
            links: Array.isArray(group.links) ? group.links : []
          }))
        : [];

      const activeMethodId =
        parsed.activeMethodId && sanitizedMethods.some((method) => method.id === parsed.activeMethodId)
          ? parsed.activeMethodId
          : sanitizedMethods[0].id;

      const workspace: WorkspaceProjectData = {
        version: 3,
        projectName: normalizeProjectName(parsed.projectName),
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        activeMethodId,
        methods: sanitizedMethods,
        groups,
        projectSections: sanitizeProjectSections(parsed.projectSections),
        flows: sanitizeProjectFlows(parsed.flows, sanitizedMethods)
      };

      return normalizeWorkspaceForMode(workspace, enableMultiMethods);
    }

    if ('sections' in parsed && Array.isArray(parsed.sections)) {
      const legacyMethod = createMethodDocument(DEFAULT_METHOD_NAME, sanitizeSections(parsed.sections));
      return {
        version: 3,
        projectName: DEFAULT_PROJECT_NAME,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        activeMethodId: legacyMethod.id,
        methods: [legacyMethod],
        groups: [],
        projectSections: createDefaultProjectSections(),
        flows: [createDefaultFlow(legacyMethod.id)]
      };
    }

    return createWorkspaceSeed();
  } catch {
    return createWorkspaceSeed();
  }
}
