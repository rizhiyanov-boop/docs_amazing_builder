import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraStandaloneScreen } from './JiraStandaloneScreen';
import type { JiraClient } from '../jiraClient';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

function mockJiraClient(): JiraClient {
  return {
    status: vi.fn(async () => ({
      connected: true,
      remembered: true,
      baseUrl: 'https://jira.example',
      expiresAt: null,
      user: 'User',
      project: { id: '10000', key: 'DI', name: 'Department of Integration', url: 'https://jira.example/browse/DI', issueTypes: [] }
    })),
    metadata: vi.fn(async () => ({
      project: { id: '10000', key: 'DI', name: 'Department of Integration', url: 'https://jira.example/browse/DI', issueTypes: [] },
      story: { id: '10001', name: 'User Story' },
      task: { id: '10002', name: 'Task' },
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
    tags: vi.fn(async () => ({ items: ['api', 'integration'] })),
    prepare: vi.fn(async () => ({
      summary: '[DI] Test freeform task',
      descriptionRu: 'Описание',
      descriptionEn: 'Description',
      descriptionUz: 'Tavsif',
      suggestedTags: ['api']
    })),
    create: vi.fn(async () => ({
      key: 'DI-5001',
      url: 'https://jira.example/browse/DI-5001',
      summary: '[DI] Test freeform task'
    })),
    operation: vi.fn(async () => ({ state: 'none' as const, issue: null, linkedUrl: null })),
    issue: vi.fn(async () => { throw new Error('Not found'); }),
    confirm: vi.fn(async () => ({ state: 'success' as const, issue: null, linkedUrl: null })),
    acceptCurrent: vi.fn(async () => ({} as any)),
    update: vi.fn(async () => ({} as any)),
    link: vi.fn(async () => {}),
    unlink: vi.fn(async () => {})
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
      user: null,
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
