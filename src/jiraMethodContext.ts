import { richTextToPlainText } from './richText';
import type { MethodDocument } from './types';

function endpointOnly(value: string): string {
  try { const url = new URL(value); return url.pathname; }
  catch { return value.split(/[?#]/)[0]; }
}

/** Source payloads, examples and auth metadata are excluded from the AI request. */
export function jiraMethodContext(method: MethodDocument): string {
  return method.sections.filter(section => section.enabled).flatMap(section => {
    if (section.kind === 'text') return [`${section.title}: ${richTextToPlainText(section.value).slice(0, 3000)}`];
    if (section.kind === 'parsed' && section.sectionType === 'request') return [`${section.requestMethod ?? ''} ${endpointOnly(section.requestUrl ?? '')}`.trim()];
    return [];
  }).join('\n').slice(0, 20000);
}
