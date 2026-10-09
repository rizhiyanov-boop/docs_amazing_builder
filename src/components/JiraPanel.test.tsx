import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraPanel } from './JiraPanel';
import type { JiraClient, JiraEpics } from '../jiraClient';
import type { JiraDraft } from '../jiraDraft';
import { jiraFormCacheKey, writeJiraFormCache } from '../jiraFormCache';
afterEach(() => { cleanup(); localStorage.clear(); });

function fixture(ready = true): JiraClient {
  return {
    status: vi.fn().mockResolvedValue({ connected: true, remembered: true, baseUrl: 'https://jira.example', project: { id: '101', key: 'IN', name: 'Interns', url: 'https://jira.example/projects/IN' } }),
    metadata: vi.fn().mockResolvedValue({ project: {}, issueKind: 'story', story: ready ? { id: '1', name: 'Задача' } : null, epicField: 'customfield_10203', epicRequired: false, priorities: [{ id: '3', name: 'Medium' }], labelsSupported: true, requiredFields: [], message: ready ? '' : 'В этом проекте нет типа User Story.' }),
    operation: vi.fn().mockResolvedValue({ state: 'none', issue: null, linkedUrl: null }),
    epics: vi.fn().mockResolvedValue({ items: [{ key: 'IN-5', name: 'Integration' }], nextStart: null }),
    create: vi.fn().mockResolvedValue({ state: 'success', issue: { id: '17', key: 'IN-17', url: 'https://jira.example/browse/IN-17' }, linkedUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' }),
    issue: vi.fn().mockResolvedValue({ issue: { id: '17', key: 'IN-17', url: 'https://jira.example/browse/IN-17', issueType: { id: '1', name: 'Задача' }, summary: 'Implement CRIF API', description: 'Description from Jira', epic: '', labels: ['business'], priorityId: '3', updated: '', fingerprint: 'a'.repeat(64) }, metadata: { project: {}, issueKind: 'task', story: { id: '1', name: 'Задача' }, epicField: 'customfield_10203', epicRequired: false, requiredFields: [], priorities: [{ id: '3', name: 'Medium' }], labelsSupported: true, editableFields: ['summary', 'description', 'labels', 'priority', 'customfield_10203'], message: '' }, operation: { state: 'success', issue: { id: '17', key: 'IN-17', url: 'https://jira.example/browse/IN-17' }, linkedUrl: null } }),
    update: vi.fn(), acceptCurrent: vi.fn(), link: vi.fn(), confirm: vi.fn()
  };
}
describe('Jira integration panel', () => {
  it.each([false, true])('migrates automatic Task drafts but preserves explicit Task choice (%s)', async explicit => {
    const client = fixture();
    if (explicit) vi.mocked(client.metadata).mockResolvedValue({ project: {}, issueKind: 'task', story: { id: '1', name: 'Task' }, epicRequired: false, priorities: [], labelsSupported: true, requiredFields: [], message: '' });
    writeJiraFormCache(jiraFormCacheKey({ baseUrl: 'https://jira.example', projectId: '101' }, 'cached-type'), {
      issueKind: 'task', ...(explicit ? { issueKindExplicit: true } : {}), summary: 'Preserved draft',
      descriptionRu: 'Saved text', descriptionEn: '', descriptionUz: '', description: '', epic: '', labels: [], priorityId: '', search: '', epicQuery: ''
    });
    render(<JiraPanel client={client} methodId="cached-type" methodName="Method" onBusyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Название · английский, глагол действия')).toHaveValue('Preserved draft'));
    expect(screen.getByLabelText('Тип задачи')).toHaveValue(explicit ? 'task' : 'story');
    expect(screen.getByLabelText('Описание · русский')).toHaveValue('Saved text');
    expect(client.metadata).toHaveBeenLastCalledWith({ baseUrl: 'https://jira.example', projectId: '101' }, explicit ? 'task' : 'story');
    expect(client.create).not.toHaveBeenCalled();
  });
  it('shows preparation stages until the AI request settles and allows retry after failure', async () => {
    const client = fixture();
    let resolveEpics!: (value: JiraEpics) => void;
    let rejectDraft!: (error: Error) => void;
    vi.mocked(client.epics).mockResolvedValueOnce({ items: [{ key: 'IN-5', name: 'Integration' }], nextStart: 50 })
      .mockImplementationOnce(() => new Promise(resolve => { resolveEpics = resolve; }));
    const prepareDraft = vi.fn(() => new Promise<JiraDraft>((_resolve, reject) => { rejectDraft = reject; }));
    const onBusyChange = vi.fn();
    render(<JiraPanel client={client} prepareDraft={prepareDraft} methodId="progress-method" methodName="Method" onBusyChange={onBusyChange} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Подготовить через ИИ' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    expect(screen.getByRole('status', { name: 'Статус запроса к ИИ' })).toHaveTextContent('загружаем эпики проекта');
    expect(prepareDraft).not.toHaveBeenCalled();
    await act(async () => { resolveEpics({ items: [{ key: 'IN-9', name: 'Credit' }], nextStart: null }); });
    expect(screen.getByRole('status', { name: 'Статус запроса к ИИ' })).toHaveTextContent('готовим название, описание и рекомендации');
    expect(screen.getByRole('button', { name: 'Подготовка через ИИ…' })).toBeDisabled();
    expect(prepareDraft).toHaveBeenCalledOnce();
    await act(async () => { rejectDraft(new Error('Тестовая ошибка ИИ')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Тестовая ошибка ИИ');
    expect(screen.queryByRole('status', { name: 'Статус запроса к ИИ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подготовить через ИИ' })).toBeEnabled();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it('loads all epic pages for AI ranking without selecting an epic automatically and creates one User Story with the chosen epic', async () => {
    const client = fixture();
    vi.mocked(client.epics).mockResolvedValueOnce({ items: [{ key: 'IN-5', name: 'Integration' }], nextStart: 50 }).mockResolvedValue({ items: [{ key: 'IN-9', name: 'Credit' }], nextStart: null });
    const prepareDraft = vi.fn().mockResolvedValue({ summary: 'Implement CRIF API', descriptionRu: 'Разработать метод CRIF через адаптер для кредитного процесса.', descriptionEn: 'Implement the CRIF API through the adapter for the credit process.', descriptionUz: 'Kredit jarayoni uchun adapter orqali CRIF usulini ishlab chiqish.', rankedEpics: [{ key: 'IN-9', reason: 'Кредитный процесс' }, { key: 'IN-5', reason: 'Интеграция' }], labels: [{ key: 'business', reason: 'Бизнес' }], priorityId: '3', priorityReason: 'Обычная задача' });
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
    expect(screen.getByLabelText('Описание · узбекский перевод (латиница)')).toHaveValue('Kredit jarayoni uchun adapter orqali CRIF usulini ishlab chiqish.');
    fireEvent.change(screen.getByLabelText('Описание · узбекский перевод (латиница)'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Создать User Story' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Описание · узбекский перевод (латиница)'), { target: { value: 'Kredit jarayoni uchun adapter orqali CRIF usulini ishlab chiqish.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать User Story' }));
    await screen.findByRole('link', { name: 'IN-17' });
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledWith({ baseUrl: 'https://jira.example', projectId: '101' }, { methodId: 'method-1', issueKind: 'story', summary: 'Implement CRIF API', description: 'Разработать метод CRIF через адаптер для кредитного процесса.\n\nImplement the CRIF API through the adapter for the credit process.\n\nKredit jarayoni uchun adapter orqali CRIF usulini ishlab chiqish.', epic: 'IN-9', labels: ['business', 'qaa'], priorityId: '3', confluenceUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' });
    expect(onLinked).toHaveBeenCalledWith('method-1', 'https://jira.example/browse/IN-17');
    expect(screen.queryByRole('button', { name: 'Создать User Story' })).toBeNull();
  });
  it('does not substitute another type when the selected Task type is missing', async () => {
    render(<JiraPanel client={fixture(false)} methodId="method-1" methodName="Method" onBusyChange={vi.fn()} />);
    await screen.findByText('В этом проекте нет типа User Story.');
    expect(screen.getByRole('button', { name: 'Создать User Story' })).toBeDisabled();
  });
  it('restores an uncertain write and offers confirmation without another create button', async () => {
    const client = fixture(); vi.mocked(client.operation).mockResolvedValue({ state: 'unknown', issue: null, linkedUrl: null });
    render(<JiraPanel client={client} methodId="method-1" methodName="Method" onBusyChange={vi.fn()} />);
    await screen.findByText('Результат создания не подтверждён');
    expect(screen.queryByRole('button', { name: 'Создать User Story' })).toBeNull();
    expect(client.create).not.toHaveBeenCalled();
  });
  it('preserves a method binding when the local journal or selected Jira project changes', async () => {
    const client = fixture();
    vi.mocked(client.issue).mockRejectedValue(new Error('Задача относится к другому проекту.'));
    render(<JiraPanel client={client} methodId="method-1" methodName="Method" jiraTicket="https://jira.example/browse/DI-17" onBusyChange={vi.fn()} />);
    await screen.findByText('Метод уже связан с задачей Jira');
    expect(screen.queryByRole('button', { name: 'Создать User Story' })).toBeNull();
    expect(client.create).not.toHaveBeenCalled();
  });
  it('restores local input after leaving the screen without leaking drafts across methods', async () => {
    const client = fixture(); const props = { client, methodId: 'local-1', methodName: 'Method', onBusyChange: vi.fn() };
    const view = render(<JiraPanel {...props} />);
    await screen.findByRole('option', { name: 'IN-5 · Integration' });
    fireEvent.change(screen.getByLabelText('Название · английский, глагол действия'), { target: { value: 'Develop saved draft' } });
    fireEvent.change(screen.getByLabelText('Описание · русский'), { target: { value: 'Местный текст' } });
    fireEvent.change(screen.getByLabelText(/Привязать к эпику/), { target: { value: 'IN-5' } });
    view.unmount();
    const second = render(<JiraPanel {...props} />);
    await waitFor(() => expect(screen.getByLabelText('Название · английский, глагол действия')).toHaveValue('Develop saved draft'));
    expect(screen.getByLabelText('Описание · русский')).toHaveValue('Местный текст');
    expect(screen.getByLabelText(/Привязать к эпику/)).toHaveValue('IN-5');
    second.rerender(<JiraPanel {...props} methodId="local-2" />);
    await waitFor(() => expect(screen.getByLabelText('Название · английский, глагол действия')).toHaveValue(''));
    expect(client.create).not.toHaveBeenCalled();
  });
  it('loads a bound issue, restores unsaved edits, blocks stale drafts and updates the same issue', async () => {
    const client = fixture(); const linked = await client.issue({ baseUrl: 'https://jira.example', projectId: '101' }, 'bound-1');
    vi.mocked(client.issue).mockClear();
    const props = { client, methodId: 'bound-1', methodName: 'Method', jiraTicket: 'https://jira.example/browse/IN-17', onBusyChange: vi.fn(), onLinked: vi.fn() };
    const view = render(<JiraPanel {...props} />);
    await waitFor(() => expect(screen.getByLabelText('Описание Jira')).toHaveValue('Description from Jira'));
    fireEvent.change(screen.getByLabelText('Описание Jira'), { target: { value: 'Local edit' } });
    view.unmount();
    const newer = { ...linked, issue: { ...linked.issue, description: 'Remote edit', fingerprint: 'b'.repeat(64) } };
    vi.mocked(client.issue).mockResolvedValue(newer);
    vi.mocked(client.update).mockResolvedValue({ ...newer, issue: { ...newer.issue, description: 'Local edit', fingerprint: 'c'.repeat(64) } });
    render(<JiraPanel {...props} />);
    await waitFor(() => expect(screen.getByLabelText('Описание Jira')).toHaveValue('Local edit'));
    expect(screen.getByRole('button', { name: 'Обновить задачу' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Оставить мои правки' }));
    fireEvent.click(screen.getByRole('button', { name: 'Обновить задачу' }));
    await waitFor(() => expect(client.update).toHaveBeenCalledWith({ baseUrl: 'https://jira.example', projectId: '101' }, expect.objectContaining({ methodId: 'bound-1', link: props.jiraTicket, fingerprint: 'b'.repeat(64), description: 'Local edit' })));
    expect(client.create).not.toHaveBeenCalled();
    expect(props.onLinked).toHaveBeenCalledWith('bound-1', props.jiraTicket);
  });
  it('refreshes a clean bound form from Jira on tab return instead of treating the old snapshot as local edits', async () => {
    const client = fixture(); const linked = await client.issue({ baseUrl: 'https://jira.example', projectId: '101' }, 'clean-bound');
    const props = { client, methodId: 'clean-bound', methodName: 'Method', jiraTicket: linked.issue.url, onBusyChange: vi.fn() };
    const view = render(<JiraPanel {...props} />);
    await waitFor(() => expect(screen.getByLabelText('Описание Jira')).toHaveValue('Description from Jira'));
    view.rerender(<JiraPanel {...props} active={false} />);
    vi.mocked(client.issue).mockResolvedValue({ ...linked, issue: { ...linked.issue, description: '\nNew remote description\n', fingerprint: 'd'.repeat(64) } });
    view.rerender(<JiraPanel {...props} active />);
    await waitFor(() => expect(screen.getByLabelText('Описание Jira')).toHaveValue('\nNew remote description\n'));
    expect(screen.queryByRole('button', { name: 'Оставить мои правки' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Обновить задачу' })).toBeDisabled();
  });
  it('prepares and creates without any available epic and explains empty tag recommendations', async () => {
    const client = fixture(); vi.mocked(client.epics).mockResolvedValue({ items: [], nextStart: null });
    const prepareDraft = vi.fn().mockResolvedValue({ summary: 'Implement CRIF API', descriptionRu: 'Реализовать метод CRIF.', descriptionEn: 'Implement the CRIF API.', descriptionUz: 'CRIF usulini amalga oshirish.', rankedEpics: [], labels: [], labelsReason: 'В документации не указан источник задачи.', priorityId: '', priorityReason: '' });
    render(<JiraPanel client={client} prepareDraft={prepareDraft} methodId="method-1" methodName="Method" onBusyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Подготовить через ИИ' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    await screen.findByText('В документации не указан источник задачи.');
    expect(prepareDraft.mock.calls[0][0].epics).toEqual([]);
    expect(screen.getByRole('button', { name: 'Создать User Story' })).toBeDisabled();
    fireEvent.click(screen.getByText('Все теги · 14'));
    const catalog = within(screen.getByRole('group', { name: 'Все теги' }));
    fireEvent.click(catalog.getByRole('checkbox', { name: /qaa/ }));
    expect(screen.getByRole('button', { name: 'Создать User Story' })).toBeDisabled();
    fireEvent.click(catalog.getByRole('checkbox', { name: /platform/ }));
    expect(screen.getByRole('button', { name: 'Создать User Story' })).toBeEnabled();
    fireEvent.click(catalog.getByRole('checkbox', { name: /platform/ }));
    expect(screen.getByRole('button', { name: 'Создать User Story' })).toBeDisabled();
    fireEvent.click(catalog.getByRole('checkbox', { name: /platform/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Создать User Story' }));
    await screen.findByRole('link', { name: 'IN-17' });
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.create).mock.calls[0][1]).not.toHaveProperty('epic');
  });
  it('respects an Epic Link required by Jira project settings', async () => {
    const client = fixture(); const meta = await client.metadata({ baseUrl: 'https://jira.example', projectId: '101' });
    vi.mocked(client.metadata).mockResolvedValue({ ...meta, epicRequired: true });
    const prepareDraft = vi.fn().mockResolvedValue({ summary: 'Implement CRIF API', descriptionRu: 'Реализовать метод CRIF.', descriptionEn: 'Implement the CRIF API.', descriptionUz: 'CRIF usulini amalga oshirish.', rankedEpics: [], labels: [{ key: 'business', reason: 'Задача бизнеса' }], priorityId: '', priorityReason: '' });
    render(<JiraPanel client={client} prepareDraft={prepareDraft} methodId="method-1" methodName="Method" onBusyChange={vi.fn()} />);
    await screen.findByRole('option', { name: 'IN-5 · Integration' });
    fireEvent.click(screen.getByRole('button', { name: 'Подготовить через ИИ' }));
    await screen.findByText(/ИИ не нашёл подходящего эпика/);
    expect(screen.getByRole('button', { name: 'Создать User Story' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Привязать к эпику/), { target: { value: 'IN-5' } });
    expect(screen.getByRole('button', { name: 'Создать User Story' })).toBeEnabled();
  });
});
