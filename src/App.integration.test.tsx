import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const STORAGE_KEY = 'doc-builder-project-v2';
const ONBOARDING_ENTRY_SUPPRESS_KEY = 'doc-builder-onboarding-entry-suppressed-v1';

function renderApp(): void {
  window.localStorage.setItem(ONBOARDING_ENTRY_SUPPRESS_KEY, '1');
  render(<App />);
}

function getStoredProjectRaw(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

function findButton(pattern: RegExp): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((item) => {
    return pattern.test(item.textContent ?? '') || pattern.test(item.getAttribute('aria-label') ?? '');
  });
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

async function openImportDialog(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Импорт' }));
  expect(document.querySelector('.import-routing-backdrop')).not.toBeNull();
}

async function openEditorMode(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getAllByRole('button', { name: 'Editor' })[0]);
}

function getNavigationTree(): HTMLElement {
  return screen.getByRole('tree');
}

describe('App integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    cleanup();
  });

  it('renders Workbench shell and autosaves initial workspace', async () => {
    renderApp();

    expect(screen.getByText('doc-builder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workbench' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'HTML' })).toBeInTheDocument();

    await waitFor(() => {
      const raw = getStoredProjectRaw();
      expect(raw).toBeTruthy();
      expect(raw).toContain('"version":3');
      expect(raw).toContain('"methods"');
    });
  });

  it('switches to html and wiki preview screens', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'HTML' }));
    expect(screen.getByText('doc-builder · Published HTML')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Поиск')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Wiki' }));
    expect(screen.getByRole('heading', { name: 'Wiki' })).toBeInTheDocument();
    expect(screen.getByDisplayValue(/\{toc\}/i)).toBeInTheDocument();
  });

  it('exports html and wiki through blob download', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderApp();

    await user.click(screen.getByRole('button', { name: 'HTML' }));
    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    await user.click(screen.getByRole('button', { name: 'Wiki' }));
    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('opens and closes project import dialog from Workbench topbar', async () => {
    const user = userEvent.setup();
    renderApp();

    await openImportDialog(user);
    await user.click(findButton(/Отмена|РћС‚РјРµРЅР°/));

    await waitFor(() => {
      expect(document.querySelector('.import-routing-backdrop')).toBeNull();
    });
  });

  it('shows parse validation error for empty request source', async () => {
    const user = userEvent.setup();
    renderApp();

    await openEditorMode(user);
    await user.click(within(getNavigationTree()).getByRole('treeitem', { name: /Request/i }));
    const parseButton = document.querySelector('button[title="Запустить парсер"], button[title="Р—Р°РїСѓСЃС‚РёС‚СЊ РїР°СЂСЃРµСЂ"]') as HTMLButtonElement | null;
    expect(parseButton).not.toBeNull();
    await user.click(parseButton as HTMLButtonElement);

    await waitFor(() => {
      expect(document.querySelectorAll('.alert.error').length).toBeGreaterThan(0);
    });
  });

  it('routes cURL text import without json parse error', async () => {
    const user = userEvent.setup();
    renderApp();

    await openImportDialog(user);
    const textarea = document.querySelector('textarea.source-edit') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea as HTMLTextAreaElement, {
      target: {
        value: "curl -X POST 'https://api.example.com/orders?limit=1' -H 'Content-Type: application/json' --data-raw '{\"orderId\":1}'"
      }
    });

    await user.click(findButton(/Импортировать текст|РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ С‚РµРєСЃС‚/));

    await waitFor(() => {
      expect(document.querySelector('.import-routing-backdrop')).not.toBeNull();
    });
    expect(screen.queryByText(/Ошибка импорта|РћС€РёР±РєР° РёРјРїРѕСЂС‚Р°/i)).not.toBeInTheDocument();
  });

  it('switches active editor section from sidebar click', async () => {
    const user = userEvent.setup();
    renderApp();

    await openEditorMode(user);
    await user.click(within(getNavigationTree()).getByRole('treeitem', { name: /Response/i }));

    await waitFor(() => {
      const responseSection = document.querySelector('#section-response');
      expect(responseSection).not.toBeNull();
      expect(responseSection?.classList.contains('editor-section-active')).toBe(true);
    });
  });

  it('imports invalid project json and shows import error', async () => {
    renderApp();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const invalidFile = new File(['{invalid-json}'], 'bad.json', { type: 'application/json' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [invalidFile] } });

    expect(await screen.findByText(/Ошибка импорта|РћС€РёР±РєР° РёРјРїРѕСЂС‚Р°/i)).toBeInTheDocument();
  });

  it('imports multiple workspace json files as methods', async () => {
    const user = userEvent.setup();
    renderApp();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const methodA = JSON.stringify({
      version: 3,
      updatedAt: '2026-04-23T12:00:00.000Z',
      methods: [{ id: 'm_a', name: 'Method A', updatedAt: '2026-04-23T12:00:00.000Z', sections: [{ id: 's_a', title: 'Goal', enabled: true, kind: 'text', value: 'A' }] }],
      groups: []
    });
    const methodB = JSON.stringify({
      version: 3,
      updatedAt: '2026-04-23T12:00:00.000Z',
      methods: [{ id: 'm_b', name: 'Method B', updatedAt: '2026-04-23T12:00:00.000Z', sections: [{ id: 's_b', title: 'Goal', enabled: true, kind: 'text', value: 'B' }] }],
      groups: []
    });

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [
          new File([methodA], 'method-a.json', { type: 'application/json' }),
          new File([methodB], 'method-b.json', { type: 'application/json' })
        ]
      }
    });

    await waitFor(() => {
      expect(document.querySelector('.import-routing-backdrop')).not.toBeNull();
    });
    expect(screen.getByText(/Method A/i)).toBeInTheDocument();
    expect(screen.getByText(/Method B/i)).toBeInTheDocument();
    await user.click(findButton(/Импортировать методы|РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РјРµС‚РѕРґС‹/));

    await waitFor(() => {
      expect(within(getNavigationTree()).getByRole('treeitem', { name: /Method B/i })).toBeInTheDocument();
    });
  });

  it('imports a single method json file as a method', async () => {
    const user = userEvent.setup();
    renderApp();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const singleMethod = JSON.stringify({
      id: 'method_catalog_search',
      name: 'Catalog Search',
      updatedAt: '2026-04-23T20:33:00.000Z',
      sections: [
        { id: 's_goal', title: 'Goal', enabled: true, kind: 'text', value: 'Search catalog with filters' },
        { id: 's_request', title: 'Request', enabled: true, kind: 'parsed', sectionType: 'request', format: 'json', lastSyncedFormat: 'json', input: '{"query":"phone"}', rows: [], error: '' }
      ]
    });

    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [new File([singleMethod], 'method-single-object.json', { type: 'application/json' })] }
    });

    await waitFor(() => {
      expect(screen.getByText(/Catalog Search/i)).toBeInTheDocument();
    });
    await user.click(findButton(/Импортировать метод|РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РјРµС‚РѕРґ/));

    await waitFor(() => {
      expect(within(getNavigationTree()).getByRole('treeitem', { name: /Catalog Search/i })).toBeInTheDocument();
    });
  });

  it('imports a single method from pasted json text', async () => {
    const user = userEvent.setup();
    renderApp();

    await openImportDialog(user);
    const textarea = document.querySelector('textarea.source-edit') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea as HTMLTextAreaElement, {
      target: {
        value: JSON.stringify({
          id: 'method_customer_lookup',
          name: 'Customer Lookup',
          updatedAt: '2026-04-23T20:33:00.000Z',
          sections: [
            { id: 's_goal', title: 'Goal', enabled: true, kind: 'text', value: 'Find customer by id' },
            { id: 's_response', title: 'Response', enabled: true, kind: 'parsed', sectionType: 'response', format: 'json', lastSyncedFormat: 'json', input: '{"customerId":"C-1"}', rows: [], error: '' }
          ]
        })
      }
    });

    await user.click(findButton(/Импортировать текст|РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ С‚РµРєСЃС‚/));
    await waitFor(() => expect(screen.getByText(/Customer Lookup/i)).toBeInTheDocument());
    await user.click(findButton(/Импортировать метод|РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РјРµС‚РѕРґ/));

    await waitFor(() => {
      expect(within(getNavigationTree()).getByRole('treeitem', { name: /Customer Lookup/i })).toBeInTheDocument();
    });
  });

  it('imports method json with partial parsed rows without trim crash', async () => {
    const user = userEvent.setup();
    renderApp();

    await openImportDialog(user);
    const textarea = document.querySelector('textarea.source-edit') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    fireEvent.change(textarea as HTMLTextAreaElement, {
      target: {
        value: JSON.stringify({
          id: 'method_partial_rows',
          name: 'Partial Rows Method',
          sections: [{ id: 'request', enabled: true, kind: 'parsed', rows: [{ id: 'row-1', required: '+', source: 'body' }], error: '' }]
        })
      }
    });

    await user.click(findButton(/Импортировать текст|РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ С‚РµРєСЃС‚/));
    await waitFor(() => expect(screen.getByText(/Partial Rows Method/i)).toBeInTheDocument());
    await user.click(findButton(/Импортировать метод|РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РјРµС‚РѕРґ/));

    await waitFor(() => {
      expect(within(getNavigationTree()).getByRole('treeitem', { name: /Partial Rows Method/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Ошибка импорта|РћС€РёР±РєР° РёРјРїРѕСЂС‚Р°/i)).not.toBeInTheDocument();
  });

  it('shows preview with added methods and invalid files before multi import', async () => {
    const user = userEvent.setup();
    renderApp();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const validMethod = new File([JSON.stringify({
      id: 'method_preview_ok',
      name: 'Preview OK',
      sections: [{ id: 's_goal', title: 'Goal', enabled: true, kind: 'text', value: 'ok' }]
    })], 'preview-ok.json', { type: 'application/json' });
    const invalidFile = new File(['{bad-json'], 'broken.json', { type: 'application/json' });

    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [validMethod, invalidFile] } });

    await waitFor(() => expect(screen.getByText(/Preview OK/i)).toBeInTheDocument());
    expect(screen.getByText(/broken.json/i)).toBeInTheDocument();
    await user.click(findButton(/Импортировать метод|РРјРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РјРµС‚РѕРґ/));

    await waitFor(() => {
      expect(within(getNavigationTree()).getByRole('treeitem', { name: /Preview OK/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/broken.json/i)).toBeInTheDocument();
    });
  });
});
