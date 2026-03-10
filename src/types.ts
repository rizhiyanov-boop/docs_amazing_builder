export type ParseFormat = 'json' | 'xml' | 'curl';
export type RequestColumnKey = 'field' | 'type' | 'required' | 'clientField' | 'description' | 'example';

export type SectionKind = 'text' | 'parsed';

export interface ParsedRow {
  field: string;
  clientField?: string;
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
  input: string;
  rows: ParsedRow[];
  error: string;
  domainModelEnabled?: boolean;
  clientFormat?: ParseFormat;
  clientInput?: string;
  clientRows?: ParsedRow[];
  clientError?: string;
  clientMappings?: Record<string, string>;
  requestColumnOrder?: RequestColumnKey[];
}

export type DocSection = TextSection | ParsedSection;

export interface ProjectData {
  version: number;
  updatedAt: string;
  sections: DocSection[];
}
