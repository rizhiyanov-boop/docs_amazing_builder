import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraTaskWorkflow } from './JiraTaskWorkflow';
import type { JiraClient } from '../jiraClient';

afterEach(() => { cleanup(); localStorage.clear(); });
function fixture(): JiraClient {
  return {
    status: vi.fn().mockResolvedValue({ connected: true, remembered: true, baseUrl: 'https://jira.example', project: { id: '101', key: 'IN', name: 'Test' } }),
    operation: vi.fn().mockResolvedValue({ state: 'none', issue: null, linkedUrl: null }),
    metadata: vi.fn().mockResolvedValue({ project: {}, issueKind: 'task', story: { id: '1', name: 'Task' }, epicRequired: false, labelsSupported: true, requiredFields: [], priorities: [], message: '' }),
    epics: vi.fn().mockResolvedValue({ items: [], nextStart: null }),
    issue: vi.fn(), create: vi.fn(), update: vi.fn(), link: vi.fn(), confirm: vi.fn(), acceptCurrent: vi.fn()
  };
}
const props = { methodId: 'method-1', methodName: 'Existing method', methodContext: 'Method-only documentation', active: true, onBusyChange: vi.fn() };
describe('Jira scenario isolation', () => {
  it('creates a standalone task without a method link and starts a fresh operation only after confirmed success', async () => {
    const client = fixture(); const onLinked = vi.fn();
    const operation = { state: 'success' as const, issue: { id: '17', key: 'IN-17', url: 'https://jira.example/browse/IN-17' }, linkedUrl: null };
    vi.mocked(client.create).mockResolvedValue(operation);
    vi.mocked(client.issue).mockResolvedValue({ operation, metadata: { project: {} as never, issueKind: 'task', story: { id: '1', name: 'Task' }, epicRequired: false, labelsSupported: true, requiredFields: [], editableFields: ['summary', 'description', 'labels'], message: '' }, issue: { ...operation.issue, issueType: { id: '1', name: 'Task' }, summary: 'Improve search', description: 'Описание', labels: ['business'], priorityId: '', epic: '', fingerprint: 'f'.repeat(64), updated: '' } });
    const prepareDraft = vi.fn().mockResolvedValue({ summary: 'Improve search', descriptionRu: 'Улучшить поиск.', descriptionEn: 'Improve search.', descriptionUz: 'Qidiruvni yaxshilash.', labels: [{ key: 'business', reason: 'Улучшение' }], rankedEpics: [], priorityId: '', priorityReason: '' });
    render(<JiraTaskWorkflow {...props} client={client} onLinked={onLinked} prepareDraft={prepareDraft} confluenceUrl="https://confluence.example/private-page" />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободное описание' }));
    fireEvent.change(await screen.findByLabelText('Что нужно сделать'), { target: { value: 'Улучшить поиск' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Подготовить через ИИ' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeEnabled());
    const key = 'docbuilder:jira-standalone:v1:https%3A%2F%2Fjira.example:101'; const id = localStorage.getItem(key);
    fireEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Начать следующую задачу' })).toBeEnabled());
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.create).mock.calls[0][1]).toMatchObject({ methodId: id, summary: 'Improve search' });
    expect(vi.mocked(client.create).mock.calls[0][1]).not.toHaveProperty('confluenceUrl');
    expect(onLinked).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Начать следующую задачу' }));
    expect(localStorage.getItem(key)).not.toBe(id);
    expect(await screen.findByLabelText('Что нужно сделать')).toHaveValue('');
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it('prepares freeform input without sending the method or changing its binding, and restores its identity', async () => {
    const client = fixture(); const onLinked = vi.fn(); const prepareDraft = vi.fn().mockRejectedValue(new Error('Synthetic failure'));
    const view = render(<JiraTaskWorkflow {...props} client={client} onLinked={onLinked} prepareDraft={prepareDraft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободное описание' }));
    const input = await screen.findByLabelText('Что нужно сделать');
    expect(screen.getByRole('button', { name: 'Подготовить через ИИ' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Исправить поиск' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Подготовить через ИИ' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    await screen.findByText('Synthetic failure');
    expect(prepareDraft).toHaveBeenCalledWith(expect.objectContaining({ source: { kind: 'freeform', description: 'Исправить поиск' }, method: { name: 'Свободное описание', context: '' } }));
    expect(onLinked).not.toHaveBeenCalled();
    const key = 'docbuilder:jira-standalone:v1:https%3A%2F%2Fjira.example:101';
    const id = localStorage.getItem(key);
    expect(client.operation).toHaveBeenCalledWith(expect.anything(), id);
    view.unmount();
    render(<JiraTaskWorkflow {...props} client={client} prepareDraft={prepareDraft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободное описание' }));
    expect(await screen.findByLabelText('Что нужно сделать')).toHaveValue('Исправить поиск');
    expect(localStorage.getItem(key)).toBe(id);
  });
  it('creates a separate operation for a new method task and keeps the existing link', async () => {
    const client = fixture(); const onLinked = vi.fn(); const prepareDraft = vi.fn().mockRejectedValue(new Error('Prepared'));
    render(<JiraTaskWorkflow {...props} jiraTicket="https://jira.example/browse/IN-7" client={client} onLinked={onLinked} prepareDraft={prepareDraft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Новая задача по методу' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Подготовить через ИИ' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    await screen.findByText('Prepared');
    expect(prepareDraft).toHaveBeenCalledWith(expect.objectContaining({ method: { name: props.methodName, context: props.methodContext } }));
    const id = localStorage.getItem('docbuilder:jira-new-method:v1:https%3A%2F%2Fjira.example:101:method-1');
    expect(id).not.toBe(props.methodId);
    expect(client.operation).toHaveBeenCalledWith(expect.anything(), id);
    expect(onLinked).not.toHaveBeenCalled();
  });
  it('does not permit starting another task when the previous outcome is unknown', async () => {
    const client = fixture(); vi.mocked(client.operation).mockResolvedValue({ state: 'unknown', issue: null, linkedUrl: null });
    render(<JiraTaskWorkflow {...props} client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Свободное описание' }));
    await screen.findByText('Результат создания не подтверждён');
    expect(screen.getByRole('button', { name: 'Начать следующую задачу' })).toBeDisabled();
    expect(client.create).not.toHaveBeenCalled();
  });
});
