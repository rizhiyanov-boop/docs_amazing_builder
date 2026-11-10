import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  it('imports and reopens a draft, then updates the source only after reviewing its current version', async () => {
    let page = { ...templateImportPage(), view: '<p>Current page</p>' };
    bridge.getStatus.mockResolvedValue({ connected: true, baseUrl: importTestOrigin, versionComments: true });
    bridge.getSpaces.mockResolvedValue({ items: [{ key: 'TEST', name: 'Test space' }], nextStart: null });
    bridge.getTree.mockResolvedValue({ items: [{ id: page.id, title: page.title }], nextStart: null });
    bridge.getPage.mockImplementation(async () => page);
    bridge.prepare.mockResolvedValue({ storage: '<p>Prepared update</p>' });
    bridge.publish.mockImplementation(async () => ({ ...page, version: page.version + 1 }));
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
    const template = screen.getByRole('combobox', { name: 'Шаблон метода' });
    expect(template).toHaveValue('orchestration');
    await user.selectOptions(template, 'simple');
    expect(screen.getByRole('button', { name: 'Добавить метод' })).toBeDisabled();
    await user.selectOptions(template, 'orchestration');
    await user.click(screen.getByRole('button', { name: 'Добавить метод' }));
    await waitFor(() => expect(stored()).toHaveLength(2));
    expect(stored()[1]).toMatchObject({ templateId: 'orchestration', status: 'draft', confluenceImport: { pageId: page.id, version: 2 } });
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
    await user.click(await screen.findByRole('button', { name: /^Confluence & Jira\b/ }));
    expect(await screen.findByRole('heading', { name: 'Обновление исходной страницы' })).toBeInTheDocument();
    const prepareUpdate = screen.getByRole('button', { name: 'Подготовить обновление' });
    await waitFor(() => expect(prepareUpdate).toBeEnabled());
    await user.click(prepareUpdate);
    await screen.findByRole('heading', { name: 'Первое обновление после импорта' });
    expect(bridge.prepare).toHaveBeenCalledWith(expect.stringContaining('|Цель|Сохранить запрос|'), expect.any(Array), importTestOrigin);
    expect(bridge.prepare.mock.calls[0][0]).not.toContain('|Внешний URL|/api/example|');
    const versionNote = screen.getByRole('textbox', { name: 'Комментарий к версии' });
    expect((versionNote as HTMLInputElement).value).toContain('Переход на шаблон DocBuilder');
    fireEvent.change(versionNote, { target: { value: 'Переход на шаблон адаптера' } });
    const replace = screen.getByRole('button', { name: 'Заменить содержимое' });
    expect(replace).toBeDisabled();
    expect(bridge.publish).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox', { name: /Я проверил версию 3/ }));
    page = { ...page, version: 4, storage: '<p>Remote edit</p>' };
    await user.click(replace);
    await screen.findByRole('heading', { name: 'Страницу изменили в Confluence' });
    const confirm = await screen.findByRole('checkbox', { name: /Я проверил версию 4/ });
    expect(confirm).not.toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Комментарий к версии' })).toHaveValue('Переход на шаблон адаптера');
    expect(bridge.publish).not.toHaveBeenCalled();
    await user.click(confirm);
    await user.click(screen.getByRole('button', { name: 'Заменить содержимое' }));
    await screen.findByRole('heading', { name: 'Страница обновлена' });
    expect(bridge.publish).toHaveBeenCalledOnce();
    expect(bridge.publish).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: importTestOrigin, pageId: page.id, spaceKey: page.spaceKey, expectedVersion: 4, mode: 'update',
      versionMessage: 'Переход на шаблон адаптера'
    }));
    await waitFor(() => expect(stored()[2].confluence).toMatchObject({ pageId: page.id, lastPublishedVersion: 5 }));
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
    await user.click(within(screen.getByRole('dialog', { name: 'Шаблон нового метода' })).getByRole('button', { name: /Простой метод/ }));
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
