import { describe, expect, it } from 'vitest';
import { buildJiraDraftPrompt, normalizeJiraDraft, normalizeJiraDraftInput } from './jiraDraft';
import { jiraMethodContext } from './jiraMethodContext';
import { renderWikiDocument } from './renderWiki';
import type { MethodDocument } from './types';
import { renderWikiPreviewInline, splitWikiPreviewRow } from './wikiPreviewLinks';

const input = { method: { name: 'CRIF', context: 'Получить сведения CRIF' }, project: { key: 'IN', name: 'Test' }, issueType: 'Task', epics: [{ key: 'IN-5', name: 'Integration' }], priorities: [{ id: '3', name: 'Medium' }] };
describe('Jira AI and export boundary', () => {
  const summaryDraft = { descriptionRu: 'Реализовать изменение.', descriptionEn: 'Implement the change.', descriptionUz: 'Ozgarishni amalga oshirish.', rankedEpics: [], labels: [], priorityId: '', priorityReason: '' };
  it.each(['[OpenAPI] Implement gradual rollout', '[Payroll Domain] Implement salary calculation', '[Платежи] Update payment processing', 'Implement payment processing'])('accepts service-prefixed and compatible summaries: %s', summary => {
    expect(normalizeJiraDraft({ ...summaryDraft, summary }, input).summary).toBe(summary);
  });
  it('requests a service grounded in the authorized source and does not invent missing services', () => {
    const prompt = buildJiraDraftPrompt(input);
    expect(prompt).toContain('[Название сервиса]');
    expect(prompt).toContain('Максимум 120 символов вместе с префиксом');
    expect(prompt).toContain('Если сервис явно не указан или неоднозначен');
    expect(prompt).toContain('Не используй название проекта Jira');
  });
  it('uses only the freeform description rather than the current method', () => {
    const result = normalizeJiraDraftInput({ ...input, source: { kind: 'freeform', description: 'Исправить поиск на странице' } });
    expect(result.method).toEqual({ name: 'Свободное описание', context: '' });
    expect(buildJiraDraftPrompt(result)).toContain('из свободного описания');
    expect(buildJiraDraftPrompt(result)).not.toContain('Получить сведения CRIF');
    expect(() => normalizeJiraDraftInput({ ...input, source: { kind: 'freeform', description: ' ' } })).toThrow();
  });
  it('requests the implementation template and passes the documented HTTP method', () => {
    const normalized = normalizeJiraDraftInput({ ...input, method: { ...input.method, httpMethod: 'POST' } });
    const prompt = buildJiraDraftPrompt(normalized);
    expect(normalized.method.httpMethod).toBe('POST');
    expect(prompt).toContain('[Adapter Name] Implement Method Name');
    expect(prompt).toContain('[ASBT ADAPTER] Implement POST /v1/credit-info');
    expect(prompt).toContain('[LOAN DOMAIN] Implement GET /v1/credit-info');
    expect(prompt).toContain('The system analysis is complete.');
    expect(prompt).toContain('The method is implemented.');
    expect(prompt).toContain('Для исправлений, обновлений и прочих задач из свободного описания используй общий формат');
  });
  it('whitelists input and rejects epics from another project', () => {
    expect(normalizeJiraDraftInput({ ...input, token: 'secret', baseUrl: 'https://secret.example', project: { ...input.project, token: 'secret' } })).toEqual(input);
    expect(() => normalizeJiraDraftInput({ ...input, epics: [{ key: 'DI-5', name: 'Other' }] })).toThrow('выбранному проекту');
    expect(normalizeJiraDraftInput({ ...input, epics: [] }).epics).toEqual([]);
  });
  it('rejects invented epic/tag/priority IDs and enforces the two languages', () => {
    const output = { summary: 'Implement CRIF enquiry', descriptionRu: 'Разработать интеграцию CRIF.', descriptionEn: 'Implement the CRIF integration.', descriptionUz: 'CRIF integratsiyasini ishlab chiqish.', rankedEpics: [{ key: 'IN-5', reason: 'Соответствует интеграции' }, { key: 'IN-999', reason: 'Invented' }], labels: [{ key: 'business', reason: 'Задача бизнеса' }, { key: 'automation', reason: 'Test only' }, { key: 'invented', reason: 'Wrong' }], priorityId: '999' };
    expect(normalizeJiraDraft(output, input)).toMatchObject({ rankedEpics: [{ key: 'IN-5', reason: 'Соответствует интеграции' }], labels: [{ key: 'business', reason: 'Задача бизнеса' }], priorityId: '' });
    expect(() => normalizeJiraDraft({ ...output, summary: 'Разработать CRIF' }, input)).toThrow('языки');
    expect(normalizeJiraDraft(output, input).descriptionUz).toBe(output.descriptionUz);
    expect(normalizeJiraDraft({ ...output, descriptionRu: undefined, descriptionEn: '', descriptionUz: '   ' }, input))
      .toMatchObject({ descriptionRu: '', descriptionEn: '', descriptionUz: '' });
    expect(normalizeJiraDraft(output, input).labelsReason).toContain('Часть рекомендаций');
    expect(normalizeJiraDraft({ ...output, rankedEpics: [], labels: [], labelsReason: 'Не указан источник задачи.' }, { ...input, epics: [] })).toMatchObject({ rankedEpics: [], labels: [], labelsReason: 'Не указан источник задачи.' });
    expect(normalizeJiraDraft({ ...output, labels: [] }, input).labelsReason).toContain('нет рекомендаций тегов');
  });
  it('excludes request examples, auth values and endpoint credentials; exports the Jira link in the existing history column', () => {
    const method: MethodDocument = { id: '1', name: 'CRIF', updatedAt: '2026-10-06', sections: [{ id: 'request', title: 'Request', enabled: true, kind: 'parsed', sectionType: 'request', format: 'json', requestMethod: 'POST', requestUrl: 'https://user:password@private.example/api/crif?token=secret', input: '{"token":"secret"}', authTokenExample: 'secret', rows: [], error: '' }] };
    expect(jiraMethodContext(method)).toBe('POST /api/crif');
    const wiki = renderWikiDocument([], { jiraTicket: 'https://jira.example/browse/IN-17', updatedAt: '2026-10-06' });
    expect(wiki).toContain('||Версия||Описание||Исполнитель||Дата||Jira||');
    expect(wiki).toContain('|06.10.2026|[IN-17|https://jira.example/browse/IN-17]|');
    const row = splitWikiPreviewRow('|v.1|Создание документа| |06.10.2026|[IN-17|https://jira.example/browse/IN-17]|');
    expect(row).toHaveLength(5);
    expect(renderWikiPreviewInline(row[4])).toContain('href="https://jira.example/browse/IN-17"');
    expect(renderWikiPreviewInline('[click|javascript:alert(1)]')).not.toContain('<a');
  });
});
