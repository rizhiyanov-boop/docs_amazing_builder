import type { ConfluenceDiagram, ConfluenceDocument } from './confluenceTypes';
import { resolveDiagramEngine } from './diagramUtils';
import { renderWikiDocument } from './renderWiki';
import type { WikiRenderMeta } from './renderWiki';
import type { MethodDocument, ParsedSection } from './types';

// FNV-1a is a deterministic change indicator, not a security or integrity check.
function contentFingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `docbuilder-v1-${hash.toString(16).padStart(16, '0')}`;
}

export function renderConfluenceDocument(method: MethodDocument, meta: WikiRenderMeta = {}): ConfluenceDocument {
  const request = method.sections.find((section): section is ParsedSection => (
    section.kind === 'parsed' && section.sectionType === 'request'
  ));
  const renderMeta: WikiRenderMeta = {
    httpMethod: request?.requestMethod ?? 'POST',
    path: request?.requestUrl?.trim() || request?.externalRequestUrl?.trim() || '/',
    jiraTicket: method.jiraTicket,
    epic: method.epic,
    initiators: method.initiators,
    responsible: method.responsible,
    externalUrl: method.externalUrl,
    updatedAt: method.updatedAt,
    ...meta
  };
  const source = JSON.stringify({ method, meta: renderMeta });
  const diagrams: ConfluenceDiagram[] = [];
  const wiki = renderWikiDocument(method.sections, renderMeta, {
    renderDiagram: (diagram) => {
      let placeholder = `DOCBUILDER_DIAGRAM_${String(diagrams.length + 1).padStart(4, '0')}`;
      // User prose and diagram source must never be mistaken for a replacement marker.
      while (source.includes(placeholder)) placeholder += '_X';
      diagrams.push({
        placeholder,
        engine: resolveDiagramEngine(diagram.code, diagram.engine),
        code: diagram.code
      });
      return ['', placeholder, ''];
    }
  });
  return {
    wiki,
    diagrams,
    fingerprint: contentFingerprint(JSON.stringify([method.name, wiki, diagrams]))
  };
}
