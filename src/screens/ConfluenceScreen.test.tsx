import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfluenceClientError, type ConfluenceClient } from '../confluenceClient';
import { renderConfluenceDocument } from '../confluenceDocument';
import type { ConfluencePage, ConfluencePublishRequest } from '../confluenceTypes';
import type { MethodDocument } from '../types';
import { ConfluenceScreen } from './ConfluenceScreen';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
const baseUrl = 'https://confluence.example';
const otherBaseUrl = 'https://other.example';
const method: MethodDocument = { id: 'method-1', name: 'Example method', updatedAt: '2026-10-02T12:00:00Z', sections: [{ id: 'purpose', title: 'Цель', enabled: true, kind: 'text', value: 'Test document' }] };
function page(id = '123', version = 1, spaceKey = 'TEST'): ConfluencePage {
  return { id, title: id === '123' ? 'Раздел' : id === '124' ? 'Дочерняя страница' : 'Example method', spaceKey, version, url: `${baseUrl}/pages/viewpage.action?pageId=${id}`, ancestors: [], storage: '<p>Current page</p>' };
}
function mockClient(): ConfluenceClient {
  return {
    getStatus: vi.fn(async () => ({ connected: true, baseUrl, user: 'User' })),
    getSpaces: vi.fn(async () => ({ items: [{ key: 'TEST', name: 'Тестовое пространство' }, { key: 'PERSONAL', name: 'Личное пространство' }], nextStart: null })),
    getTree: vi.fn(async (_space, parentId, start = 0) => parentId
      ? { items: parentId === '123' ? [{ id: '124', title: 'Дочерняя страница' }] : [], nextStart: null }
      : { items: [start === 0 ? { id: '123', title: 'Раздел' } : { id: '125', title: 'Другой раздел' }], nextStart: start === 0 ? 25 : null }),
    getPage: vi.fn(async id => page(id)),
    prepare: vi.fn(async () => ({ storage: '<p>Prepared document</p>' })),
    publish: vi.fn(async () => page('127')),
    getOperation: vi.fn(async () => ({ state: 'unknown' as const })),
    confirmOperation: vi.fn(async () => page('127'))
  };
}
it('shows selected parent content beside the new page form without preparing or writing', async () => {
  const client = mockClient();
  vi.mocked(client.getPage).mockResolvedValue({ ...page(), view: '<h2>Parent heading</h2><table><tbody><tr><td>Parent cell</td></tr></tbody></table>' });
  const { user } = setup(client);
  const preview = screen.getByRole('region', { name: 'Просмотр родительской страницы' });
  expect(await within(preview).findByText(/Выберите страницу в дереве/)).toBeInTheDocument();
  await user.click(await screen.findByRole('button', { name: 'Раздел', exact: true }));
  expect(await within(preview).findByRole('heading', { name: 'Parent heading' })).toBeInTheDocument();
  expect(within(preview).getByRole('cell', { name: 'Parent cell' })).toBeInTheDocument();
  expect(screen.getByText('Новая страница будет создана внутри: Раздел')).toBeInTheDocument();
  expect(client.prepare).not.toHaveBeenCalled();
  expect(client.publish).not.toHaveBeenCalled();
});
function linkedMethod(): MethodDocument {
  return { ...method, confluence: { baseUrl, pageId: '126', spaceKey: 'TEST', lastPublishedVersion: 1, publishedAt: '2026-10-02T12:00:00Z', publishedFingerprint: renderConfluenceDocument(method).fingerprint } };
}
function setup(client = mockClient(), doc = method) {
  const onPublished = vi.fn();
  const onBack = vi.fn();
  const onBusyChange = vi.fn();
  const view = render(<ConfluenceScreen method={doc} client={client} onPublished={onPublished} onBack={onBack} onBusyChange={onBusyChange} />);
  return { client, onPublished, onBack, onBusyChange, view, user: userEvent.setup() };
}
async function publishCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Раздел', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Опубликовать' }));
}

describe('Confluence workbench screen', () => {
  it.each(['publish', 'browse'] as const)('reveals a linked page through paginated ancestors in %s', async tab => {
    const client = mockClient();
    vi.mocked(client.getTree).mockImplementation(async (space, parentId, start = 0) => {
      if (space !== 'PERSONAL') return { items: [{ id: '123', title: 'Раздел' }], nextStart: null };
      const target = parentId === undefined ? { id: '700', title: 'Корневой раздел' }
        : parentId === '700' ? { id: '701', title: 'Вложенный раздел' }
        : { id: '702', title: 'Страница по ссылке' };
      return { items: start === 0 ? [{ id: `other-${parentId ?? 'root'}`, title: 'Соседняя страница' }] : [target], nextStart: start === 0 ? 50 : null };
    });
    vi.mocked(client.getPage).mockResolvedValue({ ...page('702', 1, 'PERSONAL'), title: 'Страница по ссылке', ancestors: [{ id: '700', title: 'Корневой раздел' }, { id: '701', title: 'Вложенный раздел' }] });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const bottom = this.classList.contains('cf-tree') ? 100 : 300;
      return { top: 0, bottom, left: 0, right: 100, width: 100, height: bottom, x: 0, y: 0, toJSON: () => ({}) };
    });
    const { user } = setup(client);
    await screen.findByRole('button', { name: 'Раздел', exact: true });
    if (tab === 'browse') await user.click(screen.getByRole('button', { name: 'Страницы', exact: true }));
    await user.click(screen.getByText('Перейти по ссылке на страницу'));
    await user.type(screen.getByRole('textbox', { name: 'Ссылка Confluence' }), `${baseUrl}/spaces/PERSONAL/pages/702/Example`);
    await user.click(screen.getByRole('button', { name: 'Открыть страницу', exact: true }));
    const selected = await screen.findByRole('button', { name: 'Страница по ссылке', exact: true });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Свернуть Корневой раздел' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Свернуть Вложенный раздел' })).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(selected.closest('.cf-tree')?.scrollTop).toBe(200));
    for (const parentId of [undefined, '700', '701']) expect(client.getTree).toHaveBeenCalledWith('PERSONAL', parentId, 50, baseUrl);
    expect(client.getTree).not.toHaveBeenCalledWith('PERSONAL', '702', 0, baseUrl);
    expect(client.publish).not.toHaveBeenCalled();
  });

  it('loads roots without a search and loads children only on explicit expansion, with pagination', async () => {
    const { client, user, view } = setup();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await screen.findByRole('button', { name: 'Раздел', exact: true });
    expect(client.getTree).toHaveBeenCalledTimes(1);
    expect(client.getTree).toHaveBeenCalledWith('TEST', undefined, 0, baseUrl);
    expect(screen.queryByRole('button', { name: 'Дочерняя страница', exact: true })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Раскрыть Раздел' }));
    await screen.findByRole('button', { name: 'Дочерняя страница', exact: true });
    expect(client.getTree).toHaveBeenCalledWith('TEST', '123', 0, baseUrl);
    expect(client.getPage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Загрузить ещё корневые страницы' }));
    await screen.findByRole('button', { name: 'Другой раздел', exact: true });
    expect(client.getTree).toHaveBeenCalledWith('TEST', undefined, 25, baseUrl);
    expect(setItem).not.toHaveBeenCalled();
    expect(document.querySelector('input[type=password]')).toBeNull();
    view.unmount();
    setup(client);
    await screen.findByRole('button', { name: 'Дочерняя страница', exact: true });
    expect(client.getTree).toHaveBeenLastCalledWith('TEST', '123', 0, baseUrl);
  });

  it('keeps browsing separate from publication and reads roots again on reopening', async () => {
    const { client, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Раздел', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Страницы', exact: true }));
    await user.click(screen.getByRole('button', { name: /^Пространство:/ }));
    await user.click(screen.getByRole('button', { name: 'Все пространства', exact: true }));
    await user.click(screen.getByRole('button', { name: /Личное пространство.*PERSONAL/ }));
    await screen.findByRole('button', { name: 'Раздел', exact: true });
    await user.click(screen.getByRole('button', { name: 'Публикация', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Пространство:/ })).toHaveTextContent('TEST'));
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await screen.findByRole('heading', { name: 'Страница создана' });
    expect(client.getTree).toHaveBeenCalledWith('PERSONAL', undefined, 0, baseUrl);
    expect(client.getPage).toHaveBeenLastCalledWith('123', baseUrl);
  });

  it('distinguishes a failed branch from successful empty children', async () => {
    const client = mockClient();
    vi.mocked(client.getTree).mockRejectedValueOnce(new ConfluenceClientError('ACCESS_DENIED', 'Denied'));
    const { user } = setup(client);
    await screen.findByRole('alert');
    expect(screen.queryByText('Доступных корневых страниц нет')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    await screen.findByRole('button', { name: 'Раздел', exact: true });
  });

  it('blocks replacement when Confluence has changed since the last publication', async () => {
    const client = mockClient();
    vi.mocked(client.getPage).mockResolvedValue(page('126', 2));
    const { user, onPublished } = setup(client, linkedMethod());
    await screen.findByRole('status', { name: 'Локальное подключение активно' });
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await screen.findByRole('heading', { name: 'Страницу изменили в Confluence' });
    expect(screen.getByRole('button', { name: 'Обновить страницу', exact: true })).toBeDisabled();
    expect(client.publish).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });

  it('checks the version again immediately before writing', async () => {
    const client = mockClient();
    vi.mocked(client.getPage).mockResolvedValueOnce(page('126', 1)).mockResolvedValueOnce(page('126', 1)).mockResolvedValue(page('126', 2));
    const { user } = setup(client, linkedMethod());
    await screen.findByRole('status', { name: 'Локальное подключение активно' });
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));
    await screen.findByRole('heading', { name: 'Страницу изменили в Confluence' });
    expect(client.publish).not.toHaveBeenCalled();
  });

  it('retains an unknown operation, prevents double publication and supports verified manual recovery', async () => {
    const client = mockClient();
    let rejectWrite: ((error: Error) => void) | undefined;
    vi.mocked(client.publish).mockImplementation(() => new Promise((_resolve, reject) => { rejectWrite = reject; }));
    const { user, onPublished, onBusyChange } = setup(client);
    await user.click(await screen.findByRole('button', { name: 'Раздел', exact: true }));
    const commit = screen.getByRole('button', { name: 'Опубликовать', exact: true });
    fireEvent.click(commit); fireEvent.click(commit);
    await waitFor(() => expect(client.publish).toHaveBeenCalledOnce());
    rejectWrite?.(new ConfluenceClientError('OUTCOME_UNKNOWN', 'Unknown', 409, 'original-operation'));
    await screen.findByRole('heading', { name: 'Результат публикации не подтверждён' });
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Опубликовать', exact: true })).not.toBeInTheDocument();
    expect(onPublished).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Проверить результат операции' }));
    expect(client.getOperation).toHaveBeenCalledWith('original-operation', baseUrl);
    expect(client.publish).toHaveBeenCalledOnce();
    await user.type(screen.getByLabelText('Ссылка на опубликованную страницу'), `${baseUrl}/pages/viewpage.action?pageId=127`);
    await user.click(screen.getByRole('button', { name: 'Проверить эту страницу' }));
    await screen.findByRole('heading', { name: 'Страница создана' });
    expect(client.confirmOperation).toHaveBeenCalledWith('original-operation', '127', baseUrl, expect.objectContaining({ operationId: 'original-operation', baseUrl, mode: 'create' }));
    expect(onPublished).toHaveBeenCalledWith('method-1', expect.objectContaining({ pageId: '127', baseUrl, lastPublishedVersion: 1 }));
    expect(client.publish).toHaveBeenCalledOnce();
  });

  it('publishes the reviewed snapshot if the method changes while publishing', async () => {
    const client = mockClient();
    let completeWrite: ((page: ConfluencePage) => void) | undefined;
    vi.mocked(client.publish).mockImplementation(() => new Promise(resolve => { completeWrite = resolve; }));
    const { user, view, onPublished, onBack, onBusyChange } = setup(client);
    await publishCreate(user);
    await waitFor(() => expect(client.publish).toHaveBeenCalledOnce());
    const updated = { ...method, name: 'Changed method' };
    view.rerender(<ConfluenceScreen method={updated} client={client} onPublished={onPublished} onBack={onBack} onBusyChange={onBusyChange} />);
    completeWrite?.(page('127'));
    await screen.findByText('Опубликован снимок документа · есть более новые изменения');
    const request = vi.mocked(client.publish).mock.calls[0][0] as ConfluencePublishRequest;
    expect(request.title).toBe('Example method');
    expect(request.baseUrl).toBe(baseUrl);
    expect(onPublished).toHaveBeenCalledWith('method-1', expect.objectContaining({ publishedFingerprint: renderConfluenceDocument(method).fingerprint }));
  });

  it('does not persist a late publication into a workspace after unmount', async () => {
    const client = mockClient();
    let completeWrite: ((page: ConfluencePage) => void) | undefined;
    vi.mocked(client.publish).mockImplementation(() => new Promise(resolve => { completeWrite = resolve; }));
    const { user, view, onPublished, onBusyChange } = setup(client);
    await publishCreate(user);
    await waitFor(() => expect(client.publish).toHaveBeenCalledOnce());
    view.unmount(); completeWrite?.(page('127'));
    await Promise.resolve(); await Promise.resolve();
    expect(onPublished).not.toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('does not read or convert a bound page through a different Confluence origin', async () => {
    const client = mockClient();
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl: otherBaseUrl });
    const { user, onPublished } = setup(client, linkedMethod());
    await screen.findByRole('status', { name: 'Локальное подключение активно' });
    expect(client.getPage).not.toHaveBeenCalled();
    expect(client.prepare).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Опубликовать как новую страницу' }));
    await publishCreate(user);
    expect(client.prepare).toHaveBeenCalledWith(expect.any(String), expect.any(Array), otherBaseUrl);
    await screen.findByRole('heading', { name: 'Страница создана' });
    expect(client.publish).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: otherBaseUrl }));
    expect(onPublished).toHaveBeenCalledWith(method.id, expect.objectContaining({ baseUrl: otherBaseUrl }));
  });

  it('clears the selected parent, reviewed document and tree when the connected origin changes', async () => {
    const client = mockClient();
    const { user } = setup(client);
    await user.click(await screen.findByRole('button', { name: 'Раздел', exact: true }));
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl: otherBaseUrl });
    vi.mocked(client.getTree).mockResolvedValue({ items: [{ id: '123', title: 'Новый раздел' }], nextStart: null });
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }));
    await screen.findByRole('button', { name: 'Новый раздел', exact: true });
    expect(screen.queryByRole('button', { name: 'Раздел', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Проверка новой страницы' })).not.toBeInTheDocument();
    expect(screen.getByText(/Выберите родительскую страницу в дереве/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeDisabled();
    expect(client.getTree).toHaveBeenLastCalledWith('TEST', undefined, 0, otherBaseUrl);
    expect(client.publish).not.toHaveBeenCalled();
  });

  it('keeps an unknown attempt on its original origin and blocks recovery through another connection', async () => {
    const client = mockClient();
    vi.mocked(client.publish).mockRejectedValue(new ConfluenceClientError('OUTCOME_UNKNOWN', 'Unknown', 409, 'original-operation'));
    const { user, onPublished } = setup(client);
    await publishCreate(user);
    await screen.findByRole('heading', { name: 'Результат публикации не подтверждён' });
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl: otherBaseUrl });
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }));
    await screen.findByText('Подключите этот адрес в локальном приложении и проверьте подключение здесь. Проверка через другой Confluence заблокирована.');
    await user.type(screen.getByLabelText('Ссылка на опубликованную страницу'), `${baseUrl}/pages/viewpage.action?pageId=127`);
    const operationButton = screen.getByRole('button', { name: 'Проверить результат операции' });
    const confirmButton = screen.getByRole('button', { name: 'Проверить эту страницу' });
    expect(operationButton).toBeDisabled(); expect(confirmButton).toBeDisabled();
    fireEvent.click(operationButton); fireEvent.click(confirmButton);
    expect(client.getOperation).not.toHaveBeenCalled(); expect(client.confirmOperation).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl });
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }));
    await waitFor(() => expect(operationButton).toBeEnabled());
    await user.click(operationButton);
    expect(client.getOperation).toHaveBeenCalledWith('original-operation', baseUrl);
    await user.type(screen.getByLabelText('Ссылка на опубликованную страницу'), `${baseUrl}/pages/viewpage.action?pageId=127`);
    await user.click(screen.getByRole('button', { name: 'Проверить эту страницу' }));
    await screen.findByRole('heading', { name: 'Страница создана' });
    expect(client.confirmOperation).toHaveBeenCalledWith('original-operation', '127', baseUrl, expect.objectContaining({ operationId: 'original-operation', baseUrl, mode: 'create' }));
    expect(onPublished).toHaveBeenCalledWith(method.id, expect.objectContaining({ baseUrl }));
    expect(client.publish).toHaveBeenCalledOnce();
  });

  it('discards a late page read after switching the connected origin', async () => {
    const client = mockClient();
    let completeRead: ((page: ConfluencePage) => void) | undefined;
    vi.mocked(client.getPage).mockImplementation(() => new Promise(resolve => { completeRead = resolve; }));
    const { user } = setup(client);
    await screen.findByRole('button', { name: 'Раздел', exact: true });
    await user.click(screen.getByRole('button', { name: 'Страницы', exact: true }));
    await user.click(await screen.findByRole('button', { name: 'Раздел', exact: true }));
    await waitFor(() => expect(client.getPage).toHaveBeenCalledWith('123', baseUrl));
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl: otherBaseUrl });
    vi.mocked(client.getTree).mockResolvedValue({ items: [{ id: '123', title: 'Новый раздел' }], nextStart: null });
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }));
    await screen.findByRole('button', { name: 'Новый раздел', exact: true });
    completeRead?.({ ...page(), title: 'Old origin page', storage: '<p>Old origin text</p>' });
    await Promise.resolve(); await Promise.resolve();
    expect(screen.queryByText('Old origin text')).not.toBeInTheDocument();
    expect(screen.getByText('Выберите страницу в дереве. Просмотр не изменяет проект и место публикации.')).toBeInTheDocument();
  });

  it('clears a verified result when refreshing to another origin', async () => {
    const client = mockClient();
    const { user } = setup(client);
    await publishCreate(user);
    await screen.findByRole('heading', { name: 'Страница создана' });
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl: otherBaseUrl });
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Страница создана' })).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Открыть в Confluence' })).not.toBeInTheDocument();
  });

  it('holds a late publication response until its original connection is restored', async () => {
    const client = mockClient();
    let completeWrite: ((page: ConfluencePage) => void) | undefined;
    vi.mocked(client.publish).mockImplementation(() => new Promise(resolve => { completeWrite = resolve; }));
    vi.mocked(client.getOperation).mockResolvedValue({ state: 'success', page: page('127') });
    const { user, onPublished } = setup(client);
    await publishCreate(user);
    await waitFor(() => expect(client.publish).toHaveBeenCalledOnce());
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl: otherBaseUrl });
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }));
    await waitFor(() => expect(vi.mocked(client.getSpaces)).toHaveBeenLastCalledWith(0, otherBaseUrl));
    completeWrite?.(page('127'));
    await screen.findByRole('heading', { name: 'Результат публикации не подтверждён' });
    expect(onPublished).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Проверить результат операции' })).toBeDisabled();
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl });
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Проверить результат операции' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Проверить результат операции' }));
    await screen.findByRole('heading', { name: 'Страница создана' });
    expect(onPublished).toHaveBeenCalledWith(method.id, expect.objectContaining({ baseUrl }));
    expect(client.publish).toHaveBeenCalledOnce();
  });

  it('renders an unconfigured connection without constructing an empty-origin page link', async () => {
    const client = mockClient();
    vi.mocked(client.getStatus).mockResolvedValue({ connected: false, baseUrl: '' });
    setup(client);
    await screen.findByRole('heading', { name: 'Подключите Confluence' });
    expect(screen.getByRole('link', { name: 'Открыть локальное подключение' })).toBeInTheDocument();
    expect(client.getSpaces).not.toHaveBeenCalled(); expect(client.getTree).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Открыть в Confluence' })).not.toBeInTheDocument();
  });
});
