import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfluenceClientError, type ConfluenceClient } from '../confluenceClient';
import { renderConfluenceDocument } from '../confluenceDocument';
import type { ConfluencePage, ConfluencePublishRequest } from '../confluenceTypes';
import type { MethodDocument } from '../types';
import { ConfluenceScreen } from './ConfluenceScreen';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
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
async function prepareCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Раздел', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Проверить публикацию' }));
  await screen.findByRole('button', { name: 'Создать страницу', exact: true });
}

describe('Confluence workbench screen', () => {
  it('loads roots without a search and loads children only on explicit expansion, with pagination', async () => {
    const { client, user } = setup();
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
  });

  it('keeps browsing separate from publication and reads roots again on reopening', async () => {
    const { client, user } = setup();
    await user.click(await screen.findByRole('button', { name: 'Раздел', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Страницы', exact: true }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Пространство' }), 'PERSONAL');
    await screen.findByRole('button', { name: 'Раздел', exact: true });
    await user.click(screen.getByRole('button', { name: 'Публикация', exact: true }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Пространство' })).toHaveValue('TEST'));
    await user.click(screen.getByRole('button', { name: 'Проверить публикацию' }));
    await screen.findByRole('button', { name: 'Создать страницу', exact: true });
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
    await screen.findByText('Локальное подключение активно');
    await user.click(screen.getByRole('button', { name: 'Проверить публикацию' }));
    await screen.findByRole('heading', { name: 'Страницу изменили в Confluence' });
    expect(screen.getByRole('button', { name: 'Обновить страницу', exact: true })).toBeDisabled();
    expect(client.publish).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });

  it('checks the version again immediately before writing', async () => {
    const client = mockClient();
    vi.mocked(client.getPage).mockResolvedValueOnce(page('126', 1)).mockResolvedValueOnce(page('126', 1)).mockResolvedValue(page('126', 2));
    const { user } = setup(client, linkedMethod());
    await screen.findByText('Локальное подключение активно');
    await user.click(screen.getByRole('button', { name: 'Проверить публикацию' }));
    await user.click(await screen.findByRole('button', { name: 'Обновить страницу', exact: true }));
    await screen.findByRole('heading', { name: 'Страницу изменили в Confluence' });
    expect(client.publish).not.toHaveBeenCalled();
  });

  it('retains an unknown operation, prevents double publication and supports verified manual recovery', async () => {
    const client = mockClient();
    let rejectWrite: ((error: Error) => void) | undefined;
    vi.mocked(client.publish).mockImplementation(() => new Promise((_resolve, reject) => { rejectWrite = reject; }));
    const { user, onPublished, onBusyChange } = setup(client);
    await prepareCreate(user);
    const commit = screen.getByRole('button', { name: 'Создать страницу', exact: true });
    fireEvent.click(commit); fireEvent.click(commit);
    await waitFor(() => expect(client.publish).toHaveBeenCalledOnce());
    rejectWrite?.(new ConfluenceClientError('OUTCOME_UNKNOWN', 'Unknown', 409, 'original-operation'));
    await screen.findByRole('heading', { name: 'Результат публикации не подтверждён' });
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Создать страницу', exact: true })).toBeDisabled();
    expect(onPublished).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Проверить результат операции' }));
    expect(client.getOperation).toHaveBeenCalledWith('original-operation', baseUrl);
    expect(client.publish).toHaveBeenCalledOnce();
    await user.type(screen.getByLabelText('Ссылка на опубликованную страницу'), `${baseUrl}/pages/viewpage.action?pageId=127`);
    await user.click(screen.getByRole('button', { name: 'Проверить эту страницу' }));
    await screen.findByRole('heading', { name: 'Страница создана' });
    expect(client.confirmOperation).toHaveBeenCalledWith('original-operation', '127', baseUrl);
    expect(onPublished).toHaveBeenCalledWith('method-1', expect.objectContaining({ pageId: '127', baseUrl, lastPublishedVersion: 1 }));
    expect(client.publish).toHaveBeenCalledOnce();
  });

  it('publishes the reviewed snapshot if the method changes while publishing', async () => {
    const client = mockClient();
    let completeWrite: ((page: ConfluencePage) => void) | undefined;
    vi.mocked(client.publish).mockImplementation(() => new Promise(resolve => { completeWrite = resolve; }));
    const { user, view, onPublished, onBack, onBusyChange } = setup(client);
    await prepareCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать страницу', exact: true }));
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
    await prepareCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать страницу', exact: true }));
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
    await screen.findByText('Локальное подключение активно');
    expect(client.getPage).not.toHaveBeenCalled();
    expect(client.prepare).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Проверить публикацию' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Опубликовать как новую страницу' }));
    await prepareCreate(user);
    expect(client.prepare).toHaveBeenCalledWith(expect.any(String), expect.any(Array), otherBaseUrl);
    await user.click(screen.getByRole('button', { name: 'Создать страницу', exact: true }));
    await screen.findByRole('heading', { name: 'Страница создана' });
    expect(client.publish).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: otherBaseUrl }));
    expect(onPublished).toHaveBeenCalledWith(method.id, expect.objectContaining({ baseUrl: otherBaseUrl }));
  });

  it('clears the selected parent, reviewed document and tree when the connected origin changes', async () => {
    const client = mockClient();
    const { user } = setup(client);
    await prepareCreate(user);
    vi.mocked(client.getStatus).mockResolvedValue({ connected: true, baseUrl: otherBaseUrl });
    vi.mocked(client.getTree).mockResolvedValue({ items: [{ id: '123', title: 'Новый раздел' }], nextStart: null });
    await user.click(screen.getByRole('button', { name: 'Проверить подключение' }));
    await screen.findByRole('button', { name: 'Новый раздел', exact: true });
    expect(screen.queryByRole('button', { name: 'Раздел', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Проверка новой страницы' })).not.toBeInTheDocument();
    expect(screen.getByText(/Родительская страница не выбрана/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проверить публикацию' })).toBeDisabled();
    expect(client.getTree).toHaveBeenLastCalledWith('TEST', undefined, 0, otherBaseUrl);
    expect(client.publish).not.toHaveBeenCalled();
  });

  it('keeps an unknown attempt on its original origin and blocks recovery through another connection', async () => {
    const client = mockClient();
    vi.mocked(client.publish).mockRejectedValue(new ConfluenceClientError('OUTCOME_UNKNOWN', 'Unknown', 409, 'original-operation'));
    const { user, onPublished } = setup(client);
    await prepareCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать страницу', exact: true }));
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
    expect(client.confirmOperation).toHaveBeenCalledWith('original-operation', '127', baseUrl);
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
    await prepareCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать страницу', exact: true }));
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
    await prepareCreate(user);
    await user.click(screen.getByRole('button', { name: 'Создать страницу', exact: true }));
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
    expect(screen.getByText(/Адрес Confluence не настроен/)).toBeInTheDocument();
    expect(client.getSpaces).not.toHaveBeenCalled(); expect(client.getTree).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Открыть в Confluence' })).not.toBeInTheDocument();
  });
});
