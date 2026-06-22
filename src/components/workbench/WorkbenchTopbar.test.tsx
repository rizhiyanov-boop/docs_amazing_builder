import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchTopbar } from './WorkbenchTopbar';

afterEach(cleanup);

function renderTopbar(overrides: Partial<React.ComponentProps<typeof WorkbenchTopbar>> = {}) {
  const props: React.ComponentProps<typeof WorkbenchTopbar> = {
    topbarRef: React.createRef<HTMLElement>(),
    importInputRef: React.createRef<HTMLInputElement>(),
    methodName: 'Create order',
    methodPath: '/orders',
    methodHttpMethod: 'POST',
    accent: 'warm',
    authUserLogin: 'User',
    isLogoutBusy: false,
    canUndo: true,
    canRedo: false,
    splitOpen: false,
    splitAvailable: true,
    autosaveState: 'saved',
    autosaveAt: '10:30',
    onAccentChange: vi.fn(),
    onOpenProjectImport: vi.fn(),
    onImportProjectJson: vi.fn(),
    onExportHtml: vi.fn(),
    onExportWiki: vi.fn(),
    onExportFullProjectHtml: vi.fn(),
    onExportFullProjectWiki: vi.fn(),
    onExportJson: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleSplit: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenSearch: vi.fn(),
    onRenameMethod: vi.fn(),
    onDeleteMethod: vi.fn(),
    canDeleteMethod: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onManualSave: vi.fn(),
    onLogout: vi.fn(),
    onOpenLogin: vi.fn(),
    onOpenRegister: vi.fn(),
    ...overrides
  };
  return { props, ...render(<WorkbenchTopbar {...props} />) };
}

describe('WorkbenchTopbar', () => {
  it('renders the mockup action order and autosave status', () => {
    renderTopbar();
    const topbar = screen.getByRole('banner');
    expect(within(topbar).getByLabelText('doc-builder')).toHaveTextContent('dbdoc-builder');
    expect(within(topbar).getByText('/orders')).toBeInTheDocument();
    expect(within(topbar).getByRole('button', { name: 'JSON' })).toBeInTheDocument();
    expect(within(topbar).getByRole('button', { name: 'HTML' })).toBeInTheDocument();
    expect(within(topbar).getByRole('button', { name: 'Wiki' })).toBeInTheDocument();
    expect(within(topbar).getByRole('status')).toHaveTextContent('Сохранено · 10:30');
    expect(within(topbar).getByRole('button', { name: 'Сохранить' })).toBeInTheDocument();
  });

  it('runs export, history, split, search and theme actions', async () => {
    const user = userEvent.setup();
    const result = renderTopbar();
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'HTML' }));
    await user.click(screen.getByRole('button', { name: 'Wiki' }));
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    await user.click(screen.getByRole('button', { name: 'Сплит-режим (Ctrl+\\)' }));
    await user.click(screen.getByRole('button', { name: 'Поиск (Ctrl+K)' }));
    await user.click(screen.getByRole('button', { name: 'Переключить тему' }));
    expect(result.props.onExportJson).toHaveBeenCalledOnce();
    expect(result.props.onExportHtml).toHaveBeenCalledOnce();
    expect(result.props.onExportWiki).toHaveBeenCalledOnce();
    expect(result.props.onUndo).toHaveBeenCalledOnce();
    expect(result.props.onToggleSplit).toHaveBeenCalledOnce();
    expect(result.props.onOpenSearch).toHaveBeenCalledOnce();
    expect(result.props.onToggleTheme).toHaveBeenCalledOnce();
  });

  it('marks split active and disables it for compact layout', () => {
    const { rerender, props } = renderTopbar({ splitOpen: true });
    expect(screen.getByRole('button', { name: 'Сплит-режим (Ctrl+\\)' })).toHaveAttribute('aria-pressed', 'true');
    rerender(<WorkbenchTopbar {...props} splitOpen={false} splitAvailable={false} />);
    expect(screen.getByRole('button', { name: 'Сплит-режим недоступен на узком экране' })).toBeDisabled();
  });

  it('moves import, method actions and project exports into overflow', async () => {
    const user = userEvent.setup();
    const result = renderTopbar();
    expect(screen.queryByRole('button', { name: 'Импорт' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дополнительные действия' }));
    const menu = screen.getByRole('menu', { name: 'Дополнительные действия' });
    await user.click(within(menu).getByRole('menuitem', { name: 'Импорт' }));
    expect(result.props.onOpenProjectImport).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Дополнительные действия' }));
    await user.click(screen.getByRole('menuitem', { name: 'Проект HTML' }));
    expect(result.props.onExportFullProjectHtml).toHaveBeenCalledOnce();
  });

  it('keeps profile and accent controls', async () => {
    const user = userEvent.setup();
    const onAccentChange = vi.fn();
    renderTopbar({ onAccentChange });
    await user.click(screen.getByRole('button', { name: /User/ }));
    await user.click(screen.getByRole('button', { name: 'Dusk' }));
    expect(onAccentChange).toHaveBeenCalledWith('violet');
  });
});
