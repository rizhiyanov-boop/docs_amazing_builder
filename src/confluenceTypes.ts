export interface ConfluenceBinding {
  baseUrl: string;
  spaceKey: string;
  pageId: string;
  lastPublishedVersion: number;
  publishedFingerprint: string;
  publishedAt: string;
}

export interface ConfluenceSpace { key: string; name: string; type?: 'global' | 'personal'; categories?: string[] }
export interface ConfluencePageSummary { id: string; title: string; parentId?: string | null }
export interface ConfluenceCollection<T> { items: T[]; nextStart: number | null }
export interface ConfluencePage extends ConfluencePageSummary {
  spaceKey: string;
  version: number;
  url: string;
  ancestors: ConfluencePageSummary[];
  storage?: string;
  view?: string;
}
export interface ConfluenceStatus {
  connected: boolean;
  baseUrl: string;
  expiresAt?: string | null;
  user?: string;
  bridgeVersion?: string;
  remembered?: boolean;
}
export interface ConfluenceDiagram {
  placeholder: string;
  engine: 'plantuml' | 'mermaid';
  code: string;
}
export interface ConfluenceDocument {
  wiki: string;
  diagrams: ConfluenceDiagram[];
  fingerprint: string;
}
export interface ConfluencePublishRequest {
  baseUrl: string;
  operationId: string;
  mode: 'create' | 'update';
  title: string;
  spaceKey: string;
  parentId?: string;
  pageId?: string;
  expectedVersion?: number;
  storage: string;
}
export interface ConfluenceOperation {
  state: 'pending' | 'success' | 'unknown' | 'failed';
  page?: ConfluencePage;
  message?: string;
}
