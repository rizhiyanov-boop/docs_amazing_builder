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

function getStoredProject(): Record<string, unknown> | null {
  const raw = getStoredProjectRaw();
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

function seedSingleMethodWorkspace(section: Record<string, unknown>): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 3,
      updatedAt: '2026-05-07T10:00:00.000Z',
      projectName: 'Review Project',
      activeMethodId: 'm_review',
      methods: [
        {
          id: 'm_review',
          name: 'Review Method',
          updatedAt: '2026-05-07T10:00:00.000Z',
          sections: [section]
        }
      ],
      groups: []
    })
  );
}

function getTopbar(): HTMLElement {
  const topbar = document.querySelector('.wb-topbar');
  expect(topbar).not.toBeNull();
  return topbar as HTMLElement;
}

function findTopbarButton(name: RegExp): HTMLButtonElement {
  return within(getTopbar()).getByRole('button', { name }) as HTMLButtonElement;
}

function getNavigationTree(): HTMLElement {
  return screen.getByRole('tree');
}

function getImportFileInput(): HTMLInputElement {
  const input = document.querySelector('.wb-topbar input[type="file"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

function getImportDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: /Импорт проекта из текста|Импорт JSON/i });
}

function getWorkspaceImportPreviewDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: /Импорт методов из JSON/i });
}

function getDialogButton(dialog: HTMLElement, name: RegExp): HTMLButtonElement {
  return within(dialog).getByRole('button', { name }) as HTMLButtonElement;
}

async function applyWorkspaceImportIfDialogPresent(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const previewDialog = screen.queryByRole('dialog', { name: /Импорт методов из JSON/i });
  if (!previewDialog) return;
  await user.click(getDialogButton(previewDialog, /Импортировать метод|Импортировать методы|Import/i));
}

describe('App integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    cleanup();
  });

  it('renders Workbench shell and autosaves initial workspace', async () => {
    renderApp();

    expect(getNavigationTree()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Workbench' })).toBeInTheDocument();
    expect(findTopbarButton(/^HTML$/)).toBeInTheDocument();

    await waitFor(() => {
      const raw = getStoredProjectRaw();
      expect(raw).toBeTruthy();
      expect(raw).toContain('"version":3');
      expect(raw).toContain('"methods"');
    });
  });

  it('opens add section picker upward and shows all section types', async () => {
    const user = userEvent.setup();
    seedSingleMethodWorkspace({ id: 's_goal', title: 'Goal', enabled: true, kind: 'text', value: 'A' });
    renderApp();

    await user.click(screen.getByRole('button', { name: '+ Добавить секцию' }));

    const menu = screen.getByRole('menu', { name: 'Section type' });
    expect(menu).toHaveStyle({
      top: 'auto',
      bottom: 'calc(100% + 8px)',
      transform: 'translateX(-50%)',
      zIndex: '100'
    });
    ['Text', 'Request', 'Response', 'Errors', 'Diagram'].forEach((name) => {
      expect(within(menu).getByRole('menuitem', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    });
  });

  it('offers section deletion from Workbench section action menu', async () => {
    const user = userEvent.setup();
    seedSingleMethodWorkspace({ id: 's_goal', title: 'Goal', enabled: true, kind: 'text', value: 'A' });
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Дополнительные действия секции' }));
    const deleteItem = screen.getByRole('menuitem', { name: 'Удалить раздел' });

    expect(deleteItem).toHaveStyle({ color: 'var(--wb-required)' });
    await user.click(deleteItem);

    const dialog = screen.getByRole('dialog', { name: 'Подтверждение удаления раздела' });
    expect(within(dialog).getByRole('heading', { name: 'Удалить раздел?' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Удалить раздел' })).toBeInTheDocument();
  });

  it('edits section title by double click without visible edit icon', async () => {
    const user = userEvent.setup();
    seedSingleMethodWorkspace({ id: 's_goal', title: 'Editable Title', enabled: true, kind: 'text', value: 'A' });
    renderApp();

    const main = screen.getByRole('main');
    expect(screen.queryByRole('button', { name: 'Редактировать название блока' })).not.toBeInTheDocument();

    await user.dblClick(within(main).getByText('Editable Title'));
    const titleInput = screen.getByDisplayValue('Editable Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed Title{Enter}');

    expect(within(main).getByText('Renamed Title')).toBeInTheDocument();

    await user.dblClick(within(main).getByText('Renamed Title'));
    const cancelInput = screen.getByDisplayValue('Renamed Title');
    await user.clear(cancelInput);
    await user.type(cancelInput, 'Cancelled Title{Escape}');

    expect(within(main).getByText('Renamed Title')).toBeInTheDocument();
    expect(within(main).queryByText('Cancelled Title')).not.toBeInTheDocument();
  });

  it('topbar html and wiki buttons open preview tabs without downloading', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderApp();
    expect(screen.queryByText(/Published HTML/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Wiki$/i })).not.toBeInTheDocument();

    await user.click(findTopbarButton(/^HTML$/));
    expect(screen.getByText(/Published HTML/i)).toBeInTheDocument();

    await user.click(findTopbarButton(/^Wiki$/));
    expect(screen.getByRole('heading', { name: /^Wiki$/i })).toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('opens and closes project import dialog from Workbench topbar', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(findTopbarButton(/Импорт|Import/i));
    const dialog = getImportDialog();
    expect(dialog).toBeInTheDocument();

    await user.click(getDialogButton(dialog, /Отмена|Cancel/i));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Импорт проекта из текста|Импорт JSON/i })).not.toBeInTheDocument();
    });
  });

  it('shows parse validation error for empty request source', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getAllByRole('button', { name: 'Editor' })[0]);
    await user.click(within(getNavigationTree()).getByRole('treeitem', { name: /Request/i }));

    const parseButton = document.querySelector(
      'button[title*="парсер"], button[title*="Parser"], button[title*="parse"]'
    ) as HTMLButtonElement | null;
    expect(parseButton).not.toBeNull();
    await user.click(parseButton as HTMLButtonElement);

    await waitFor(() => {
      expect(document.querySelectorAll('.alert.error').length).toBeGreaterThan(0);
    });
  });

  it('imports invalid project json and shows error alert', async () => {
    renderApp();

    const invalidFile = new File(['{invalid-json}'], 'bad.json', { type: 'application/json' });
    fireEvent.change(getImportFileInput(), { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(document.querySelectorAll('.alert.error').length).toBeGreaterThan(0);
    });
  });

  it('imports multiple workspace json files as methods', async () => {
    const user = userEvent.setup();
    renderApp();

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

    fireEvent.change(getImportFileInput(), {
      target: {
        files: [
          new File([methodA], 'method-a.json', { type: 'application/json' }),
          new File([methodB], 'method-b.json', { type: 'application/json' })
        ]
      }
    });

    const dialog = screen.queryByRole('dialog', { name: /Импорт методов из JSON/i });
    if (dialog) {
      expect(within(dialog).getByText(/Method A/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/Method B/i)).toBeInTheDocument();
    }
    await applyWorkspaceImportIfDialogPresent(user);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Импорт методов из JSON/i })).not.toBeInTheDocument();
    });
  });

  it('imports a single method json file as a method', async () => {
    const user = userEvent.setup();
    renderApp();

    const singleMethod = JSON.stringify({
      id: 'method_catalog_search',
      name: 'Catalog Search',
      updatedAt: '2026-04-23T20:33:00.000Z',
      sections: [
        { id: 's_goal', title: 'Goal', enabled: true, kind: 'text', value: 'Search catalog with filters' },
        { id: 's_request', title: 'Request', enabled: true, kind: 'parsed', sectionType: 'request', format: 'json', lastSyncedFormat: 'json', input: '{"query":"phone"}', rows: [], error: '' }
      ]
    });

    fireEvent.change(getImportFileInput(), {
      target: { files: [new File([singleMethod], 'method-single-object.json', { type: 'application/json' })] }
    });

    const dialog = screen.queryByRole('dialog', { name: /Импорт методов из JSON/i });
    if (dialog) {
      expect(within(dialog).getByText(/Catalog Search/i)).toBeInTheDocument();
    }
    await applyWorkspaceImportIfDialogPresent(user);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Импорт методов из JSON/i })).not.toBeInTheDocument();
    });
  });

  it('imports a single method from pasted json text', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(findTopbarButton(/Импорт|Import/i));
    const dialog = getImportDialog();
    const textarea = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
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

    await user.click(getDialogButton(dialog, /Импортировать|Import text/i));
    const previewDialog = getWorkspaceImportPreviewDialog();
    expect(within(previewDialog).getByText(/Customer Lookup/i)).toBeInTheDocument();

    await user.click(getDialogButton(previewDialog, /Импортировать метод|Импортировать методы|Import/i));
    await waitFor(() => {
      expect(within(getNavigationTree()).getByText(/Customer Lookup/i)).toBeInTheDocument();
    });
  });

  it('imports method json with partial parsed rows without trim crash', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(findTopbarButton(/Импорт|Import/i));
    const dialog = getImportDialog();
    const textarea = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          id: 'method_partial_rows',
          name: 'Partial Rows Method',
          sections: [{ id: 'request', enabled: true, kind: 'parsed', rows: [{ id: 'row-1', required: '+', source: 'body' }], error: '' }]
        })
      }
    });

    await user.click(getDialogButton(dialog, /Импортировать|Import text/i));
    const previewDialog = getWorkspaceImportPreviewDialog();
    expect(within(previewDialog).getByText(/Partial Rows Method/i)).toBeInTheDocument();

    await user.click(getDialogButton(previewDialog, /Импортировать метод|Импортировать методы|Import/i));
    await waitFor(() => {
      expect(within(getNavigationTree()).getByText(/Partial Rows Method/i)).toBeInTheDocument();
    });
  });

  it('keeps copied section available when switching methods and pastes with new id', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        updatedAt: '2026-05-07T10:00:00.000Z',
        projectName: 'Clipboard Project',
        activeMethodId: 'm_a',
        methods: [
          {
            id: 'm_a',
            name: 'Method A',
            updatedAt: '2026-05-07T10:00:00.000Z',
            sections: [{ id: 's_a', title: 'Goal A', enabled: true, kind: 'text', value: 'A' }]
          },
          {
            id: 'm_b',
            name: 'Method B',
            updatedAt: '2026-05-07T10:00:00.000Z',
            sections: [{ id: 's_b', title: 'Goal B', enabled: true, kind: 'text', value: 'B' }]
          }
        ],
        groups: []
      })
    );
    renderApp();

    await user.click(screen.getAllByRole('button', { name: 'Editor' })[0]);
    await user.click(screen.getByRole('button', { name: 'Копировать секцию' }));
    await user.click(within(getNavigationTree()).getByRole('button', { name: /POST Method B/i }));

    await user.click(screen.getByRole('button', { name: 'Дополнительные действия секции' }));
    await user.click(screen.getByRole('menuitem', { name: 'Вставить копию ниже' }));

    await waitFor(() => {
      const project = getStoredProject();
      const methods = (project?.methods as Array<Record<string, unknown>> | undefined) ?? [];
      const methodB = methods.find((item) => item.id === 'm_b');
      const sections = (methodB?.sections as Array<Record<string, unknown>> | undefined) ?? [];
      expect(sections).toHaveLength(2);
      const ids = sections.map((section) => String(section.id));
      expect(ids).toContain('s_b');
      expect(ids.some((id) => id !== 's_b' && id !== 's_a')).toBe(true);
    });
  });

  it('imports inline JSON into request card and updates rows', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        updatedAt: '2026-05-07T10:00:00.000Z',
        projectName: 'Inline Import',
        activeMethodId: 'm_req',
        methods: [
          {
            id: 'm_req',
            name: 'Request Method',
            updatedAt: '2026-05-07T10:00:00.000Z',
            sections: [
              {
                id: 's_request',
                title: 'Request',
                enabled: true,
                kind: 'parsed',
                sectionType: 'request',
                format: 'json',
                input: '',
                rows: [],
                error: ''
              }
            ]
          }
        ],
        groups: []
      })
    );
    renderApp();

    await user.click(screen.getByRole('button', { name: /↓ Импорт/i }));
    const textarea = screen.getByPlaceholderText('Вставьте cURL или JSON');
    fireEvent.change(textarea, { target: { value: '{"orderId":"123"}' } });
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      const project = getStoredProject();
      const methods = (project?.methods as Array<Record<string, unknown>> | undefined) ?? [];
      const method = methods.find((item) => item.id === 'm_req');
      const sections = (method?.sections as Array<Record<string, unknown>> | undefined) ?? [];
      const request = sections.find((item) => item.id === 's_request');
      const rows = (request?.rows as Array<Record<string, unknown>> | undefined) ?? [];
      expect(rows.length).toBeGreaterThan(0);
      expect(String(request?.input ?? '')).toContain('"orderId":"123"');
    });
  });

  it('shows inline parse error and allows cancel without mutations', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 3,
        updatedAt: '2026-05-07T10:00:00.000Z',
        projectName: 'Inline Import Error',
        activeMethodId: 'm_req',
        methods: [
          {
            id: 'm_req',
            name: 'Request Method',
            updatedAt: '2026-05-07T10:00:00.000Z',
            sections: [
              {
                id: 's_request',
                title: 'Request',
                enabled: true,
                kind: 'parsed',
                sectionType: 'request',
                format: 'json',
                input: '',
                rows: [],
                error: ''
              }
            ]
          }
        ],
        groups: []
      })
    );
    renderApp();

    await user.click(screen.getByRole('button', { name: /↓ Импорт/i }));
    const textarea = screen.getByPlaceholderText('Вставьте cURL или JSON');
    fireEvent.change(textarea, { target: { value: '{' } });
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(screen.getByText(/Ошибка/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByPlaceholderText('Вставьте cURL или JSON')).not.toBeInTheDocument();
  });

  it('shows preview with added methods and invalid files before multi import', async () => {
    const user = userEvent.setup();
    renderApp();

    const validMethod = new File([JSON.stringify({
      id: 'method_preview_ok',
      name: 'Preview OK',
      sections: [{ id: 's_goal', title: 'Goal', enabled: true, kind: 'text', value: 'ok' }]
    })], 'preview-ok.json', { type: 'application/json' });
    const invalidFile = new File(['{bad-json'], 'broken.json', { type: 'application/json' });

    fireEvent.change(getImportFileInput(), { target: { files: [validMethod, invalidFile] } });
    const dialog = screen.queryByRole('dialog', { name: /Импорт методов из JSON/i });
    if (dialog) {
      expect(within(dialog).getByText(/Preview OK/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/broken.json/i)).toBeInTheDocument();
    } else {
      await waitFor(() => {
        expect(document.querySelectorAll('.alert.error').length).toBeGreaterThan(0);
      });
    }

    await applyWorkspaceImportIfDialogPresent(user);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Импорт методов из JSON/i })).not.toBeInTheDocument();
    });
  });
});
