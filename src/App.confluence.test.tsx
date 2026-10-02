import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { ConfluencePage } from './confluenceTypes';

const bridge = vi.hoisted(() => ({
  getStatus: vi.fn(), getSpaces: vi.fn(), getTree: vi.fn(), getPage: vi.fn(),
  prepare: vi.fn(), publish: vi.fn(), getOperation: vi.fn(), confirmOperation: vi.fn()
}));
vi.mock('./confluenceClient', async importOriginal => ({
  ...await importOriginal<typeof import('./confluenceClient')>(), confluenceClient: bridge
}));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe('Confluence workspace integration', () => {
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
    await user.click(screen.getByRole('button', { name: '+ Метод', exact: true }));
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
