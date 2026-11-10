import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraStandaloneScreen } from './JiraStandaloneScreen';
import type { JiraClient, JiraOperation } from '../jiraClient';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function mockJiraClient(): JiraClient {
  const noOperation = async (): Promise<JiraOperation> => ({ state: 'none', issue: null, linkedUrl: null });
  const unavailableIssue = async () => { throw new Error('Not found'); };
  return {
    status: vi.fn(async () => ({
      connected: true,
      remembered: true,
      baseUrl: 'https://jira.example',
      expiresAt: null,
      project: { id: '10000', key: 'DI', name: 'Department of Integration', url: 'https://jira.example/browse/DI', issueTypes: [] }
    })),
    metadata: vi.fn(async () => ({
      project: { id: '10000', key: 'DI', name: 'Department of Integration', url: 'https://jira.example/browse/DI', issueTypes: [] },
      story: { id: '10001', name: 'User Story' },
      issueKind: 'story' as const,
      epicRequired: false,
      epicField: 'customfield_10001',
      requiredFields: [],
      message: '',
      labelsSupported: true,
      priorities: [
        { id: '1', name: 'Low' },
        { id: '2', name: 'Medium' },
        { id: '3', name: 'High' }
      ]
    })),
    epics: vi.fn(async () => ({ items: [], nextStart: null })),
    create: vi.fn(noOperation),
    operation: vi.fn(noOperation),
    issue: vi.fn(unavailableIssue),
    confirm: vi.fn(noOperation),
    acceptCurrent: vi.fn(unavailableIssue),
    update: vi.fn(unavailableIssue),
    link: vi.fn(noOperation),
    unlink: vi.fn(noOperation)
  };
}

describe('JiraStandaloneScreen', () => {
  it('renders standalone header with back button and Jira connection status', async () => {
    const onBack = vi.fn();
    const client = mockJiraClient();

    render(<JiraStandaloneScreen onBack={onBack} client={client} />);

    expect(screen.getByRole('heading', { level: 2, name: /^Jira$/i })).toBeInTheDocument();
    const backBtn = screen.getByRole('button', { name: 'Назад в редактор' });
    expect(backBtn).toBeInTheDocument();

    await userEvent.setup().click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders freeform task creation form without method-linking controls', async () => {
    const client = mockJiraClient();

    render(<JiraStandaloneScreen onBack={vi.fn()} client={client} />);

    // Renders freeform textarea
    expect(await screen.findByRole('textbox', { name: 'Что нужно сделать' })).toBeInTheDocument();

    // Does NOT render method-linking switcher buttons or method-linking status
    expect(screen.queryByRole('button', { name: /Новая задача по методу/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /К текущему методу/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Метод уже связан с задачей Jira/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Привязать к текущему методу/i })).not.toBeInTheDocument();
  });

  it('supports direct standalone mode without back button and without clutter', async () => {
    const onBack = vi.fn();
    const client = mockJiraClient();

    render(<JiraStandaloneScreen onBack={onBack} client={client} isDirectStandalone={true} />);

    // In direct standalone mode, back arrow and method switchers are omitted
    expect(screen.queryByRole('button', { name: 'Назад в редактор' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /В редактор методов/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ссылка для коллег/i })).not.toBeInTheDocument();
  });

  it('renders modern connect card when Jira is disconnected', async () => {
    const client = mockJiraClient();
    vi.mocked(client.status).mockResolvedValue({
      connected: false,
      remembered: false,
      baseUrl: '',
      expiresAt: null,
      project: null
    });

    render(<JiraStandaloneScreen onBack={vi.fn()} client={client} />);

    expect(await screen.findByRole('heading', { level: 3, name: 'Подключите Jira' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть подключение' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Скачать приложение/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проверить снова' })).toBeInTheDocument();

    // Does NOT render task creation form when disconnected
    expect(screen.queryByRole('textbox', { name: 'Что нужно сделать' })).not.toBeInTheDocument();
  });
});
