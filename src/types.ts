export type ParseFormat = 'json' | 'curl';
export type RequestColumnKey = 'field' | 'type' | 'required' | 'clientField' | 'description' | 'example';
export type RequestAuthType = 'none' | 'bearer' | 'basic' | 'api-key';
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type RequestProtocol = 'REST';

export type SectionKind = 'text' | 'parsed';

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
}

export type DocSection = TextSection | ParsedSection;

export interface ProjectData {
  version: number;
  updatedAt: string;
  sections: DocSection[];
}
