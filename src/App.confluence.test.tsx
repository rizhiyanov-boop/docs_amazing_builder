import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { ConfluencePage } from './confluenceTypes';
import type { MethodDocument } from './types';
import { importTestOrigin, templateImportPage } from './test/confluenceImportFixtures';

const bridge = vi.hoisted(() => ({
  getStatus: vi.fn(), getSpaces: vi.fn(), getTree: vi.fn(), getPage: vi.fn(),
  prepare: vi.fn(), publish: vi.fn(), getOperation: vi.fn(), confirmOperation: vi.fn()
}));
vi.mock('./confluenceClient', async importOriginal => ({
  ...await importOriginal<typeof import('./confluenceClient')>(), confluenceClient: bridge
}));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('Confluence workspace integration', () => {
  it('previews, cancels, saves and reopens a Confluence version without creating a publication binding', async () => {
    let page = templateImportPage();
    bridge.getStatus.mockResolvedValue({ connected: true, baseUrl: importTestOrigin });
    bridge.getSpaces.mockResolvedValue({ items: [{ key: 'TEST', name: 'Test space' }], nextStart: null });
    bridge.getTree.mockResolvedValue({ items: [{ id: page.id, title: page.title }], nextStart: null });
    bridge.getPage.mockImplementation(async () => page);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    localStorage.setItem('doc-builder-onboarding-entry-suppressed-v1', '1');
    localStorage.setItem('doc-builder-project-v2', JSON.stringify({ version: 3, activeMethodId: 'existing', methods: [{
      id: 'existing', name: 'Existing method', updatedAt: '2026-10-02T10:00:00Z',
      sections: [{ id: 'goal', kind: 'text', title: 'Цель', enabled: true, value: 'Original' }]
    }], groups: [] }));
    const stored = () => (JSON.parse(localStorage.getItem('doc-builder-project-v2') ?? '{}') as { methods: MethodDocument[] }).methods;
    render(<App />);
    const user = userEvent.setup();
    async function prepare() {
      await user.click(await screen.findByRole('button', { name: /^Confluence & Jira\b/ }));
      await user.click(await screen.findByRole('button', { name: 'Страницы', exact: true }));
      await user.click(await screen.findByRole('button', { name: page.title, exact: true }));
      await user.click(await screen.findByRole('button', { name: 'Подготовить импорт' }));
    }
    await prepare();
    await user.click(screen.getByRole('button', { name: 'Отмена', exact: true }));
    expect(stored()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Подготовить импорт' }));
    await user.click(screen.getByRole('button', { name: 'Добавить метод' }));
    await waitFor(() => expect(stored()).toHaveLength(2));
    expect(stored()[1]).toMatchObject({ status: 'draft', confluenceImport: { pageId: page.id, version: 2 } });
    expect(stored()[1].confluence).toBeUndefined();
    expect(document.querySelector('img[src*="plantuml.com"]')).not.toBeInTheDocument();
    await prepare();
    expect(screen.queryByRole('button', { name: 'Добавить метод' })).not.toBeInTheDocument();
    expect(stored()).toHaveLength(2);
    page = { ...page, version: 3 };
    await prepare();
    await user.click(screen.getByRole('button', { name: 'Добавить метод' }));
    await waitFor(() => expect(stored()).toHaveLength(3));
    expect(stored().slice(1).map(method => method.confluenceImport?.version)).toEqual([2, 3]);
    expect(bridge.publish).not.toHaveBeenCalled();
  }, 20_000);

  it('blocks history hotkeys during a write and persists only the confirmed binding', async () => {
    const parent: ConfluencePage = { id: '123', title: 'Remote tree root', spaceKey: 'TEST', version: 1,
      url: 'https://confluence.example/pages/viewpage.action?pageId=123', ancestors: [], storage: '<p>Parent</p>' };
    bridge.getStatus.mockResolvedValue({ connected: true, baseUrl: 'https://confluence.example' });
    bridge.getSpaces.mockResolvedValue({ items: [{ key: 'TEST', name: 'Test space' }], nextStart: null });
    bridge.getTree.mockResolvedValue({ items: [{ id: '123', title: parent.title }], nextStart: null });
    bridge.getPage.mockResolvedValue(parent);
    bridge.prepare.mockResolvedValue({ storage: '<p>Prepared document</p>' });
    let completeWrite: ((page: ConfluencePage) => void) | undefined;
    bridge.publish.mockImplementation(() => new Promise(resolve => { completeWrite = resolve; }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    localStorage.setItem('doc-builder-onboarding-entry-suppressed-v1', '1');
    localStorage.setItem('doc-builder-project-v2', JSON.stringify({ version: 3,
      updatedAt: '2026-10-02T10:00:00Z', activeMethodId: 'm1', methods: [{ id: 'm1', name: 'First method',
        updatedAt: '2026-10-02T10:00:00Z', sections: [{ id: 'goal', kind: 'text', title: 'Цель', enabled: true, value: 'Content' }] }], groups: [] }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Новый метод', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Отменить', exact: true })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /Confluence/ }));
    await user.click(await screen.findByRole('button', { name: parent.title, exact: true }));
    await user.click(screen.getByRole('button', { name: 'Опубликовать', exact: true }));
    await waitFor(() => expect(bridge.publish).toHaveBeenCalledOnce());
    fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true });
    fireEvent.keyDown(window, { code: 'KeyY', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Публикация…', exact: true })).toBeInTheDocument();
    completeWrite?.({ ...parent, id: '124', title: 'Метод 2', storage: undefined });
    await screen.findByText('Опубликовано в Confluence');
    await waitFor(() => {
      const raw = localStorage.getItem('doc-builder-project-v2') || '{}';
      const stored = JSON.parse(raw) as { methods: Array<{ confluence?: { pageId: string; baseUrl: string } }> };
      expect(stored.methods.some(method => method.confluence?.pageId === '124' && method.confluence.baseUrl === 'https://confluence.example')).toBe(true);
      expect(raw).not.toContain('Remote tree root');
      expect(raw).not.toContain('Prepared document');
    });
  });
});
