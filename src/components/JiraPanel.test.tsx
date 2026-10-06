import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraPanel } from './JiraPanel';
import type { JiraClient } from '../jiraClient';
afterEach(cleanup);

function fixture(ready = true): JiraClient {
  return {
    status: vi.fn().mockResolvedValue({ connected: true, remembered: true, baseUrl: 'https://jira.example', project: { id: '101', key: 'IN', name: 'Interns', url: 'https://jira.example/projects/IN' } }),
    metadata: vi.fn().mockResolvedValue({ project: {}, story: ready ? { id: '7', name: 'User Story' } : null, epicField: 'customfield_10203', requiredFields: [], message: ready ? '' : 'В этом проекте нет типа User Story.' }),
    operation: vi.fn().mockResolvedValue({ state: 'none', issue: null, linkedUrl: null }),
    epics: vi.fn().mockResolvedValue({ items: [{ key: 'DI-5', name: 'Integration' }], nextStart: null }),
    create: vi.fn().mockResolvedValue({ state: 'success', issue: { id: '17', key: 'IN-17', url: 'https://jira.example/browse/IN-17' }, linkedUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' }),
    link: vi.fn(), confirm: vi.fn()
  };
}
describe('Jira integration panel', () => {
  it('creates one story with selected epic and Confluence URL, then displays the binding', async () => {
    const client = fixture();
    render(<JiraPanel client={client} methodId="method-1" methodName="Method" confluenceUrl="https://confluence.example/pages/viewpage.action?pageId=123" onBusyChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'DI-5 · Integration' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Привязать к эпику'), { target: { value: 'DI-5' } });
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать User Story' }));
    await screen.findByRole('link', { name: 'IN-17' });
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledWith({ baseUrl: 'https://jira.example', projectId: '101' }, { methodId: 'method-1', summary: 'Method', description: 'Description', epic: 'DI-5', confluenceUrl: 'https://confluence.example/pages/viewpage.action?pageId=123' });
    expect(screen.queryByRole('button', { name: 'Создать User Story' })).toBeNull();
  });
  it('never substitutes Task when User Story is missing', async () => {
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
});
