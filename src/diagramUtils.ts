import type { DiagramEngine } from './types';

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
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

export function getMermaidImageUrl(code: string): string {
  const payload = JSON.stringify({ code, mermaid: { theme: 'default' } });
  return `https://mermaid.ink/img/${toBase64Url(payload)}`;
}

export function getPlantUmlImageUrl(code: string, format: 'svg' | 'jpeg' = 'svg'): string {
  return `https://www.plantuml.com/plantuml/${format}/~h${toHexUtf8(code)}`;
}

export function getDiagramImageUrl(engine: DiagramEngine, code: string, format: 'svg' | 'jpeg' = 'svg'): string {
  if (engine === 'plantuml') return getPlantUmlImageUrl(code, format);
  return getMermaidImageUrl(code);
}
