import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const STORAGE_KEY = 'doc-builder-project-v2';
const ONBOARDING_ENTRY_SUPPRESS_KEY = 'doc-builder-onboarding-entry-suppressed-v1';

function getStoredProjectRaw(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

function renderApp(): void {
  window.localStorage.setItem(ONBOARDING_ENTRY_SUPPRESS_KEY, '1');
  render(<App />);
}

describe('App integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    cleanup();
  });

  it('renders shell and autosaves initial workspace', async () => {
    renderApp();

    expect(screen.getByRole('heading', { name: 'Doc Builder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть HTML-предпросмотр' })).toBeInTheDocument();

    await waitFor(() => {
      const raw = getStoredProjectRaw();
      expect(raw).toBeTruthy();
      expect(raw).toContain('"version":3');
      expect(raw).toContain('"methods"');
    });
  });

  it('switches to html and wiki preview tabs', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('tab', { name: 'HTML' }));
    expect(screen.getByText('Предпросмотр HTML')).toBeInTheDocument();
    expect(screen.getByTitle('HTML preview')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Wiki' }));
    expect(screen.getByText('Предпросмотр Wiki')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/\{toc\}/i)).toBeInTheDocument();
  });

  it('exports html and wiki through blob download', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderApp();

    await user.click(screen.getByRole('button', { name: 'Открыть HTML-предпросмотр' }));
    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    await user.click(screen.getByRole('button', { name: 'Открыть Wiki-предпросмотр' }));
    await user.click(screen.getByRole('button', { name: 'Скачать' }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('opens and closes project import dialog from topbar', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Импорт' }));
    expect(screen.getByRole('dialog', { name: 'Импорт проекта из текста' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Импорт проекта из текста' })).not.toBeInTheDocument();
    });
  });

  it('shows parse validation error for empty request source', async () => {
    const user = userEvent.setup();
    renderApp();

    const navTree = screen.getByRole('tree', { name: 'Проекты, методы и секции' });
    await user.click(within(navTree).getByRole('treeitem', { name: /Request/i }));
    const parseButton = document.querySelector('button[title="Запустить парсер"]') as HTMLButtonElement | null;
    expect(parseButton).not.toBeNull();
    await user.click(parseButton as HTMLButtonElement);

    await waitFor(() => {
      expect(document.querySelectorAll('.alert.error').length).toBeGreaterThan(0);
    });
  });

  it('routes cURL text import without json parse error', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Импорт' }));
    const textarea = screen.getByRole('textbox', { name: 'Текст для импорта' });
    fireEvent.change(textarea, {
      target: {
        value: "curl -X POST 'https://api.example.com/orders?limit=1' -H 'Content-Type: application/json' --data-raw '{\"orderId\":1}'"
      }
    });

    await user.click(screen.getByRole('button', { name: 'Импортировать текст' }));

    expect(await screen.findByRole('dialog', { name: 'Маршрутизация JSON импорта' })).toBeInTheDocument();
    expect(screen.queryByText(/Ошибка импорта/i)).not.toBeInTheDocument();
  });

  it('switches active editor section from toc click', async () => {
    const user = userEvent.setup();
    renderApp();

    const navTree = screen.getByRole('tree', { name: 'Проекты, методы и секции' });
    await user.click(within(navTree).getByRole('treeitem', { name: /Response/i }));

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

    expect(await screen.findByText(/Ошибка импорта/i)).toBeInTheDocument();
  });

  it('imports multiple workspace json files as methods', async () => {
    renderApp();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const methodA = JSON.stringify({
      version: 3,
      updatedAt: '2026-04-23T12:00:00.000Z',
      methods: [
        {
          id: 'm_a',
          name: 'Метод A',
          updatedAt: '2026-04-23T12:00:00.000Z',
          sections: [{ id: 's_a', title: 'Цель', enabled: true, kind: 'text', value: 'A' }]
        }
      ],
      groups: []
    });
    const methodB = JSON.stringify({
      version: 3,
      updatedAt: '2026-04-23T12:00:00.000Z',
      methods: [
        {
          id: 'm_b',
          name: 'Метод B',
          updatedAt: '2026-04-23T12:00:00.000Z',
          sections: [{ id: 's_b', title: 'Цель', enabled: true, kind: 'text', value: 'B' }]
        }
      ],
      groups: []
    });

    const fileA = new File([methodA], 'method-a.json', { type: 'application/json' });
    const fileB = new File([methodB], 'method-b.json', { type: 'application/json' });

    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [fileA, fileB] } });

    const navTree = screen.getByRole('tree', { name: 'Проекты, методы и секции' });
    await waitFor(() => {
      expect(within(navTree).getByRole('treeitem', { name: /Метод B/i })).toBeInTheDocument();
    });
  });
});
