import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraPanel } from './JiraPanel';
import type { JiraClient } from '../jiraClient';
afterEach(cleanup);

function fixture(ready = true): JiraClient {
  return {
    status: vi.fn().mockResolvedValue({ connected: true, remembered: true, baseUrl: 'https://jira.example', project: { id: '101', key: 'IN', name: 'Interns', url: 'https://jira.example/projects/IN' } }),
    metadata: vi.fn().mockResolvedValue({ project: {}, issueKind: 'task', story: ready ? { id: '1', name: 'Задача' } : null, epicField: 'customfield_10203', epicRequired: false, priorities: [{ id: '3', name: 'Medium' }], labelsSupported: true, requiredFields: [], message: ready ? '' : 'В этом проекте нет типа Задача.' }),
    operation: vi.fn().mockResolvedValue({ state: 'none', issue: null, linkedUrl: null }),
    epics: vi.fn().mockResolvedValue({ items: [{ key: 'IN-5', name: 'Integration' }], nextStart: null }),
    create: vi.fn().mockResolvedValue({ state: 'success', issue: { id: '17', key: 'IN-17', url: 'https://jira.example/browse/IN-17' }, linkedUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' }),
    link: vi.fn(), confirm: vi.fn()
  };
}
describe('Jira integration panel', () => {
  it('loads all epic pages for AI ranking without selecting an epic automatically and creates one Task with the chosen epic', async () => {
    const client = fixture();
    vi.mocked(client.epics).mockResolvedValueOnce({ items: [{ key: 'IN-5', name: 'Integration' }], nextStart: 50 }).mockResolvedValue({ items: [{ key: 'IN-9', name: 'Credit' }], nextStart: null });
    const prepareDraft = vi.fn().mockResolvedValue({ summary: 'Implement CRIF API', descriptionRu: 'Разработать метод CRIF через адаптер для кредитного процесса.', descriptionEn: 'Implement the CRIF API through the adapter for the credit process.', rankedEpics: [{ key: 'IN-9', reason: 'Кредитный процесс' }, { key: 'IN-5', reason: 'Интеграция' }], labels: [{ key: 'business', reason: 'Бизнес' }], priorityId: '3', priorityReason: 'Обычная задача' });
    const onLinked = vi.fn();
    render(<JiraPanel client={client} prepareDraft={prepareDraft} methodId="method-1" methodName="Method" methodContext="Документация CRIF" confluenceUrl="https://confluence.example/pages/viewpage.action?pageId=123" onBusyChange={vi.fn()} onLinked={onLinked} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'IN-5 · Integration' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    await screen.findByRole('option', { name: '1. IN-9 · Credit' });
    expect(prepareDraft.mock.calls[0][0].epics.map((epic: { key: string }) => epic.key)).toEqual(['IN-5', 'IN-9']);
    expect(client.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Привязать к эпику/)).toHaveValue('');
    fireEvent.click(screen.getByText('Все теги · 14'));
    const catalog = within(screen.getByRole('group', { name: 'Все теги' }));
    expect(within(catalog.getByRole('group', { name: 'Основные', exact: true })).getByRole('checkbox', { name: /business/ })).toBeChecked();
    fireEvent.click(within(catalog.getByRole('group', { name: 'Дополнительные', exact: true })).getByRole('checkbox', { name: /qaa/ }));
    expect(within(catalog.getByRole('group', { name: 'Основные / дополнительные', exact: true })).getByRole('checkbox', { name: /technical_debt/ })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/Привязать к эпику/), { target: { value: 'IN-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));
    await screen.findByRole('link', { name: 'IN-17' });
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledWith({ baseUrl: 'https://jira.example', projectId: '101' }, { methodId: 'method-1', issueKind: 'task', summary: 'Implement CRIF API', description: 'Русский\nРазработать метод CRIF через адаптер для кредитного процесса.\n\nEnglish\nImplement the CRIF API through the adapter for the credit process.', epic: 'IN-9', labels: ['business', 'qaa'], priorityId: '3', confluenceUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' });
    expect(onLinked).toHaveBeenCalledWith('method-1', 'https://jira.example/browse/IN-17');
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).toBeNull();
  });
  it('does not substitute another type when the selected Task type is missing', async () => {
    render(<JiraPanel client={fixture(false)} methodId="method-1" methodName="Method" onBusyChange={vi.fn()} />);
    await screen.findByText('В этом проекте нет типа Задача.');
    expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeDisabled();
  });
  it('restores an uncertain write and offers confirmation without another create button', async () => {
    const client = fixture(); vi.mocked(client.operation).mockResolvedValue({ state: 'unknown', issue: null, linkedUrl: null });
    render(<JiraPanel client={client} methodId="method-1" methodName="Method" onBusyChange={vi.fn()} />);
    await screen.findByText('Результат создания не подтверждён');
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).toBeNull();
    expect(client.create).not.toHaveBeenCalled();
  });
  it('preserves a method binding when the local journal or selected Jira project changes', async () => {
    const client = fixture();
    render(<JiraPanel client={client} methodId="method-1" methodName="Method" jiraTicket="https://jira.example/browse/DI-17" onBusyChange={vi.fn()} />);
    await screen.findByText('Метод уже связан с задачей Jira');
    expect(screen.queryByRole('button', { name: 'Создать задачу' })).toBeNull();
    expect(client.create).not.toHaveBeenCalled();
  });
  it('prepares and creates without any available epic and explains empty tag recommendations', async () => {
    const client = fixture(); vi.mocked(client.epics).mockResolvedValue({ items: [], nextStart: null });
    const prepareDraft = vi.fn().mockResolvedValue({ summary: 'Implement CRIF API', descriptionRu: 'Реализовать метод CRIF.', descriptionEn: 'Implement the CRIF API.', rankedEpics: [], labels: [], labelsReason: 'В документации не указан источник задачи.', priorityId: '', priorityReason: '' });
    render(<JiraPanel client={client} prepareDraft={prepareDraft} methodId="method-1" methodName="Method" onBusyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Подготовить через ИИ' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    await screen.findByText('В документации не указан источник задачи.');
    expect(prepareDraft.mock.calls[0][0].epics).toEqual([]);
    expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeDisabled();
    fireEvent.click(screen.getByText('Все теги · 14'));
    const catalog = within(screen.getByRole('group', { name: 'Все теги' }));
    fireEvent.click(catalog.getByRole('checkbox', { name: /qaa/ }));
    expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeDisabled();
    fireEvent.click(catalog.getByRole('checkbox', { name: /platform/ }));
    expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeEnabled();
    fireEvent.click(catalog.getByRole('checkbox', { name: /platform/ }));
    expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeDisabled();
    fireEvent.click(catalog.getByRole('checkbox', { name: /platform/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Создать задачу' }));
    await screen.findByRole('link', { name: 'IN-17' });
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.create).mock.calls[0][1]).not.toHaveProperty('epic');
  });
  it('respects an Epic Link required by Jira project settings', async () => {
    const client = fixture(); const meta = await client.metadata({ baseUrl: 'https://jira.example', projectId: '101' });
    vi.mocked(client.metadata).mockResolvedValue({ ...meta, epicRequired: true });
    const prepareDraft = vi.fn().mockResolvedValue({ summary: 'Implement CRIF API', descriptionRu: 'Реализовать метод CRIF.', descriptionEn: 'Implement the CRIF API.', rankedEpics: [], labels: [{ key: 'business', reason: 'Задача бизнеса' }], priorityId: '', priorityReason: '' });
    render(<JiraPanel client={client} prepareDraft={prepareDraft} methodId="method-1" methodName="Method" onBusyChange={vi.fn()} />);
    await screen.findByRole('option', { name: 'IN-5 · Integration' });
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    await screen.findByText(/ИИ не нашёл подходящего эпика/);
    expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Привязать к эпику/), { target: { value: 'IN-5' } });
    expect(screen.getByRole('button', { name: 'Создать задачу' })).toBeEnabled();
  });
});
