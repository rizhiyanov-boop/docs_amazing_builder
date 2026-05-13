import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchTopbar } from './WorkbenchTopbar';

afterEach(() => {
  cleanup();
});

function renderTopbar(overrides: Partial<React.ComponentProps<typeof WorkbenchTopbar>> = {}) {
  const props: React.ComponentProps<typeof WorkbenchTopbar> = {
    topbarRef: React.createRef<HTMLElement>(),
    importInputRef: React.createRef<HTMLInputElement>(),
    methodName: 'Create order',
    methodPath: '/orders',
    methodHttpMethod: 'POST',
    mode: 'workbench',
    layout: 'vertical',
    accent: 'warm',
    authUserLogin: 'User',
    isLogoutBusy: false,
    canUndo: true,
    canRedo: false,
    onModeChange: vi.fn(),
    onLayoutChange: vi.fn(),
    onAccentChange: vi.fn(),
    onOpenProjectImport: vi.fn(),
    onImportProjectJson: vi.fn(),
    onExportHtml: vi.fn(),
    onExportWiki: vi.fn(),
    onExportJson: vi.fn(),
    onToggleSidebar: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onManualSave: vi.fn(),
    onLogout: vi.fn(),
    onOpenLogin: vi.fn(),
    onOpenRegister: vi.fn(),
    ...overrides
  };

  return {
    ...render(
      <>
        <WorkbenchTopbar {...props} />
        <button type="button">Outside target</button>
      </>
    ),
    props
  };
}

describe('WorkbenchTopbar theme panel', () => {
  it('closes theme panel on outside click', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: /User/i }));
    expect(screen.getByText('Daylight')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside target' }));
    expect(screen.queryByText('Daylight')).not.toBeInTheDocument();
  });

  it('changes accent and closes theme panel when a theme is selected', async () => {
    const user = userEvent.setup();
    const onAccentChange = vi.fn();
    renderTopbar({ onAccentChange });

    await user.click(screen.getByRole('button', { name: /User/i }));
    await user.click(screen.getByRole('button', { name: 'Dusk' }));

    expect(onAccentChange).toHaveBeenCalledWith('violet');
    expect(screen.queryByText('Daylight')).not.toBeInTheDocument();
  });

  it('closes theme panel on Escape', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: /User/i }));
    expect(screen.getByText('Daylight')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Daylight')).not.toBeInTheDocument();
  });
});
