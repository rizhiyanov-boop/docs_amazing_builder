import { richTextToPlainText } from './richText';
import type { MethodDocument, ParsedSection, RequestMethod } from './types';

export function jiraEndpointLabel(name: string, httpMethod?: RequestMethod): string {
  const title = name.trim().replace(/\s+/gu, ' ');
  if (!title || /^(?:Метод|Method)(?: \d+)?$/iu.test(title)
    || /^(?:(?:GET|POST|PUT|PATCH|DELETE)\s+)?(?:\/|https?:\/\/)/iu.test(title)) return '';
  if (!httpMethod) return title;
  return httpMethod + ' ' + title.replace(/^(?:GET|POST|PUT|PATCH|DELETE)\s+/iu, '');
}

export function jiraMethodHttpMethod(method: MethodDocument): RequestMethod | undefined {
  return method.sections.find((section): section is ParsedSection =>
    section.kind === 'parsed' && section.sectionType === 'request')?.requestMethod;
}

function endpointOnly(value: string): string {
  try { const url = new URL(value); return url.pathname; }
  catch { return value.split(/[?#]/)[0]; }
}

/** Source payloads, examples and auth metadata are excluded from the AI request. */
export function jiraMethodContext(method: MethodDocument): string {
  return method.sections.flatMap(section => {
    if (section.kind === 'text') return [`${section.title}: ${richTextToPlainText(section.value).slice(0, 3000)}`];
    if (section.kind === 'parsed' && section.sectionType === 'request') return [`${section.requestMethod ?? ''} ${endpointOnly(section.requestUrl ?? '')}`.trim()];
    return [];
  }).join('\n').slice(0, 20000);
}
