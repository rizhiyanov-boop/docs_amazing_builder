export type ParseFormat = 'json' | 'curl';
export type RequestColumnKey = 'field' | 'type' | 'required' | 'clientField' | 'description' | 'example';
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
  example: string;
  source?: 'header' | 'body' | 'url' | 'parsed';
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
  trigger: string;
  errorType: ErrorType;
  serverHttpStatus: string;
  internalCode: string;
  message: string;
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
  updatedAt: string;
  activeMethodId?: string;
  methods: MethodDocument[];
  groups: MethodGroup[];
}

export interface ProjectData {
  version: number;
  updatedAt: string;
  sections: DocSection[];
}
