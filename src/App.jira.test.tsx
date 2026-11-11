import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/api/jira/status')) {
      return Response.json({ connected: false, remembered: false, baseUrl: '', expiresAt: null, project: null });
    }
    return Response.json({}, { status: 401 });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('standalone Jira route', () => {
  it.each(['/jira', '/jira/', '/?view=jira', '/#jira'])('opens Jira directly from %s without the workspace onboarding', async path => {
    window.history.replaceState(null, '', path);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Подключите Jira' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/jira');
    expect(window.location.search + window.location.hash).toBe('');
    expect(screen.queryByRole('dialog', { name: 'Старт работы' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jira: создание задач/ })).not.toBeInTheDocument();
  });

  it('opens Jira from the toolbar, returns to the editor and keeps Jira after reloading its URL', async () => {
    localStorage.setItem('doc-builder-onboarding-entry-suppressed-v1', '1');
    const user = userEvent.setup();
    const app = render(<App />);
    const openJira = () => user.click(screen.getByRole('button', { name: /Jira: создание задач/ }));

    await openJira();
    expect(window.location.pathname).toBe('/jira');
    await user.click(await screen.findByRole('button', { name: 'Назад в редактор' }));
    expect(window.location.pathname).toBe('/');

    await openJira();
    app.unmount();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Подключите Jira' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/jira');
  });
});
