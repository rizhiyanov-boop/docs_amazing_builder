export type ParseFormat = 'json' | 'curl';
export type RequestColumnKey = 'field' | 'type' | 'required' | 'clientField' | 'description' | 'maskInLogs' | 'example';
export type RequestAuthType = 'none' | 'bearer' | 'basic' | 'api-key';
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type RequestProtocol = 'REST';
export type ParsedSectionType = 'generic' | 'request' | 'response';
export type DiagramEngine = 'mermaid' | 'plantuml';
export type ErrorType = 'CommonException' | 'BusinessException' | 'AlertException' | '-';

export type SectionKind = 'text' | 'parsed' | 'diagram' | 'errors';

export interface DiagramItem {
  id: string;
  title: string;
  engine: DiagramEngine;
  code: string;
  description?: string;
}

export interface ParsedRow {
  id?: string;
  field: string;
  sourceField?: string;
  origin?: 'parsed' | 'manual' | 'generated';
  enabled?: boolean;
  clientField?: string;
  clientSourceField?: string;
  clientOrigin?: 'parsed' | 'manual' | 'generated';
  type: string;
  required: string;
  description: string;
  maskInLogs?: boolean;
  example: string;
  source?: 'header' | 'body' | 'query' | 'url' | 'parsed';
}

export interface BaseSection {
  id: string;
  title: string;
  enabled: boolean;
  kind: SectionKind;
}

export interface TextSection extends BaseSection {
  kind: 'text';
  value: string;
  required?: boolean;
}

export interface ParsedSection extends BaseSection {
  kind: 'parsed';
  sectionType?: ParsedSectionType;
  format: ParseFormat;
  lastSyncedFormat?: ParseFormat;
  input: string;
  rows: ParsedRow[];
  error: string;
  domainModelEnabled?: boolean;
  clientFormat?: ParseFormat;
  clientLastSyncedFormat?: ParseFormat;
  clientInput?: string;
  clientRows?: ParsedRow[];
  clientError?: string;
  clientMappings?: Record<string, string>;
  requestColumnOrder?: RequestColumnKey[];
  authType?: RequestAuthType;
  authHeaderName?: string;
  authTokenExample?: string;
  authUsername?: string;
  authPassword?: string;
  authApiKeyExample?: string;
  requestUrl?: string;
  requestMethod?: RequestMethod;
  requestProtocol?: RequestProtocol;
  externalRequestUrl?: string;
  externalRequestMethod?: RequestMethod;
  externalAuthType?: RequestAuthType;
  externalAuthHeaderName?: string;
  externalAuthTokenExample?: string;
  externalAuthUsername?: string;
  externalAuthPassword?: string;
  externalAuthApiKeyExample?: string;
}

export interface DiagramSection extends BaseSection {
  kind: 'diagram';
  diagrams: DiagramItem[];
}

export interface ErrorRow {
  clientHttpStatus: string;
  clientResponse: string;
  clientResponseCode: string;
  trigger: string;
  errorType: ErrorType;
  serverHttpStatus: string;
  internalCode: string;
  message: string;
  responseCode: string;
}

export interface ValidationRuleRow {
  parameter: string;
  validationCase: string;
  condition: string;
  cause: string;
}

export interface ErrorsSection extends BaseSection {
  kind: 'errors';
  rows: ErrorRow[];
  validationRules: ValidationRuleRow[];
}

export type DocSection = TextSection | ParsedSection | DiagramSection | ErrorsSection;

export interface MethodDocument {
  id: string;
  name: string;
  updatedAt: string;
  sections: DocSection[];
}

export interface MethodGroupLink {
  fromMethodId: string;
  toMethodId: string;
  relationType?: 'request-response' | 'event' | 'sync' | 'async' | 'custom';
  note?: string;
}

export interface MethodGroup {
  id: string;
  name: string;
  methodIds: string[];
  links: MethodGroupLink[];
}

export interface WorkspaceProjectData {
  version: number;
  projectName?: string;
  updatedAt: string;
  activeMethodId?: string;
  methods: MethodDocument[];
  groups: MethodGroup[];
  projectSections?: ProjectSection[];
  flows?: ProjectFlow[];
}

export interface ProjectData {
  version: number;
  updatedAt: string;
  sections: DocSection[];
}

export interface ProjectSection {
  id: string;
  title: string;
  enabled: boolean;
  type: 'text' | 'markdown' | 'note' | 'checklist';
  content: string;
  order: number;
}

export interface FlowFieldRef {
  nodeId: string;
  side: 'request' | 'response' | 'context';
  rowId?: string;
  fieldPath?: string;
}

export interface ParamMapping {
  id: string;
  source: FlowFieldRef;
  target: {
    nodeId: string;
    side: 'request' | 'context';
    rowId?: string;
    fieldPath?: string;
  };
  transform?: string;
  note?: string;
}

export interface FlowNode {
  id: string;
  type: 'start' | 'method' | 'end' | 'note';
  position: {
    x: number;
    y: number;
  };
  label?: string;
  description?: string;
  actor?: string;
  methodRef?: {
    methodId: string;
  };
  noteContent?: string;
  preconditions?: string[];
  postconditions?: string[];
}

export interface FlowEdge {
  id: string;
  type: 'sequence';
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  condition?: string;
  mappings?: ParamMapping[];
}

export interface ProjectFlow {
  id: string;
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt?: string;
  updatedAt?: string;
}
