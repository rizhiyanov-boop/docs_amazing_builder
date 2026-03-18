import type { DiagramEngine } from './types';
import { deflate } from 'pako';

export function resolveDiagramEngine(code: string, fallback: DiagramEngine = 'mermaid'): DiagramEngine {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return fallback;

  // Strong PlantUML markers.
  if (normalized.includes('@startuml') || normalized.includes('@enduml')) {
    return 'plantuml';
  }

  // Strong Mermaid diagram headers.
  const mermaidStarters = [
    'graph ',
    'flowchart ',
    'sequencediagram',
    'classdiagram',
    'statediagram',
    'statediagram-v2',
    'erdiagram',
    'journey',
    'gantt',
    'pie',
    'mindmap',
    'timeline',
    'quadrantchart',
    'gitgraph',
    'requirementdiagram',
    'c4context',
    'c4container',
    'c4component',
    'c4dynamic',
    'c4deployment'
  ];
  if (mermaidStarters.some((starter) => normalized.startsWith(starter))) {
    return 'mermaid';
  }

  // PlantUML often appears without @startuml in copied snippets.
  const plantUmlHints = [
    /^\s*skinparam\b/m,
    /^\s*title\b/m,
    /^\s*left\s+to\s+right\s+direction\b/m,
    /^\s*participant\b/m,
    /^\s*actor\b/m,
    /^\s*usecase\b/m,
    /^\s*class\s+[\w.$]+/m,
    /^\s*interface\s+[\w.$]+/m,
    /^\s*enum\s+[\w.$]+/m,
    /^\s*abstract\s+class\s+[\w.$]+/m,
    /^\s*package\s+"?.+"?\s*\{/m,
    /^\s*database\s+"?.+"?/m,
    /^\s*node\s+"?.+"?/m,
    /^\s*component\s+"?.+"?/m,
    /^\s*rectangle\s+"?.+"?/m,
    /^\s*state\s+"?.+"?/m,
    /^\s*note\s+(left|right|top|bottom)(\s+of)?\b/m,
    /^\s*legend\b/m,
    /^\s*start\b/m,
    /^\s*stop\b/m,
    /\bendif\b/m,
    /\belseif\b/m,
    /\|[^|]+\|/m,
    /:[^\n]+;/m,
    /-->|<-|<\|\.|\*--|o--|\.\.>/m,
    /\bnote\b\s+over\b/m
  ];
  const plantUmlScore = plantUmlHints.reduce((score, pattern) => score + (pattern.test(code) ? 1 : 0), 0);
  if (plantUmlScore >= 2) {
    return 'plantuml';
  }

  return 'mermaid';
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toHexUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function slugifyDiagramName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getDiagramExportFileName(
  sectionTitle: string,
  fallbackSectionId: string,
  diagramTitle: string,
  diagramIndex: number,
  extension: 'jpeg' | 'svg' = 'jpeg'
): string {
  const sectionSlug = slugifyDiagramName(sectionTitle) || fallbackSectionId;
  const titleSlug = slugifyDiagramName(diagramTitle) || `diagram-${diagramIndex + 1}`;
  return `${sectionSlug}-${titleSlug}.${extension}`;
}

export function getMermaidImageUrl(code: string): string {
  // mermaid.ink expects pako-compressed state payload.
  const payload = JSON.stringify({ code, mermaid: { theme: 'default' } });
  const compressed = deflate(payload);
  return `https://mermaid.ink/img/pako:${toBase64Url(compressed)}`;
}

export function getPlantUmlImageUrl(code: string, format: 'svg' | 'jpeg' = 'svg'): string {
  // PlantUML endpoint does not reliably serve JPEG, so we fallback to PNG for raster output.
  const safeFormat = format === 'jpeg' ? 'png' : format;
  return `https://www.plantuml.com/plantuml/${safeFormat}/~h${toHexUtf8(code)}`;
}

export function getDiagramImageUrl(engine: DiagramEngine, code: string, format: 'svg' | 'jpeg' = 'svg'): string {
  if (engine === 'plantuml') return getPlantUmlImageUrl(code, format);
  return getMermaidImageUrl(code);
}
