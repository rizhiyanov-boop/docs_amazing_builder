import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const STORAGE_KEY = 'doc-builder-project-v2';

function getStoredProjectRaw(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

describe('App integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    cleanup();
  });

  it('renders shell and autosaves initial project', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Doc Builder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Экспорт HTML' })).toBeInTheDocument();

    await waitFor(() => {
      const raw = getStoredProjectRaw();
      expect(raw).toBeTruthy();
      expect(raw).toContain('"version":2');
    });
  });

  it('switches to html and wiki preview tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: 'HTML' }));
    expect(screen.getByText('Предпросмотр HTML')).toBeInTheDocument();
    expect(screen.getByTitle('HTML preview')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Wiki' }));
    expect(screen.getByText('Предпросмотр Wiki')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/h1\. Документация API/)).toBeInTheDocument();
  });

  it('exports html and wiki through blob download', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURL = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Экспорт HTML' }));
    await user.click(screen.getByRole('button', { name: 'Экспорт Wiki' }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('resets project after confirmation and rewrites local storage', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        updatedAt: new Date().toISOString(),
        sections: [{ id: 'custom', title: 'Кастом', enabled: true, kind: 'text', value: 'x' }]
      })
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Новый' }));

    await waitFor(() => {
      const raw = getStoredProjectRaw();
      expect(raw).toBeTruthy();
      expect(raw).toContain('"id":"goal"');
      expect(raw).not.toContain('"id":"custom"');
    });
  });

  it('shows parse validation error for empty request source', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('option', { name: /Request/i }));
    await user.click(screen.getAllByText(/Server request/i)[0]);

    const parseButtons = screen.getAllByRole('button', { name: 'Парсить' });
    await user.click(parseButtons[0]);

    expect(await screen.findByText(/Поле ввода пустое/i)).toBeInTheDocument();
  });

  it('imports invalid project json and shows import error', async () => {
    render(<App />);

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const invalidFile = new File(['{invalid-json}'], 'bad.json', { type: 'application/json' });
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [invalidFile] } });

    expect(await screen.findByText(/Ошибка импорта/i)).toBeInTheDocument();
  });
});
