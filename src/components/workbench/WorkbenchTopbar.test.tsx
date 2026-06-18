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
    accent: 'warm',
    authUserLogin: 'User',
    isLogoutBusy: false,
    canUndo: true,
    canRedo: false,
    onAccentChange: vi.fn(),
    onOpenProjectImport: vi.fn(),
    onImportProjectJson: vi.fn(),
    onExportHtml: vi.fn(),
    onExportWiki: vi.fn(),
    onExportFullProjectHtml: vi.fn(),
    onExportFullProjectWiki: vi.fn(),
    onExportJson: vi.fn(),
    onToggleSidebar: vi.fn(),
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

describe('WorkbenchTopbar supported editor controls', () => {
  it('does not expose legacy Workbench or layout switches', () => {
    renderTopbar();

    expect(screen.queryByRole('button', { name: 'Workbench' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '☰' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '⊞' })).not.toBeInTheDocument();
  });
});

describe('WorkbenchTopbar method actions menu', () => {
  it('opens method actions and runs rename/delete handlers', async () => {
    const user = userEvent.setup();
    const onRenameMethod = vi.fn();
    const onDeleteMethod = vi.fn();
    renderTopbar({ onRenameMethod, onDeleteMethod });

    await user.click(screen.getByRole('button', { name: 'Действия с методом' }));
    await user.click(screen.getByRole('menuitem', { name: 'Переименовать' }));

    expect(onRenameMethod).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: 'Переименовать' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Действия с методом' }));
    await user.click(screen.getByRole('menuitem', { name: 'Удалить метод' }));

    expect(onDeleteMethod).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: 'Удалить метод' })).not.toBeInTheDocument();
  });

  it('disables delete action for the last method', async () => {
    const user = userEvent.setup();
    const onDeleteMethod = vi.fn();
    renderTopbar({ canDeleteMethod: false, onDeleteMethod });

    await user.click(screen.getByRole('button', { name: 'Действия с методом' }));
    const deleteItem = screen.getByRole('menuitem', { name: 'Удалить метод' });

    expect(deleteItem).toBeDisabled();
    expect(deleteItem).toHaveAttribute('title', 'Нельзя удалить последний метод');

    await user.click(deleteItem);
    expect(onDeleteMethod).not.toHaveBeenCalled();
  });

  it('closes method actions on outside click and Escape', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: 'Действия с методом' }));
    expect(screen.getByRole('menuitem', { name: 'Переименовать' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside target' }));
    expect(screen.queryByRole('menuitem', { name: 'Переименовать' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Действия с методом' }));
    expect(screen.getByRole('menuitem', { name: 'Переименовать' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: 'Переименовать' })).not.toBeInTheDocument();
  });
});

describe('WorkbenchTopbar export split buttons', () => {
  it('keeps primary html/wiki preview actions on the main buttons', async () => {
    const user = userEvent.setup();
    const onExportHtml = vi.fn();
    const onExportWiki = vi.fn();
    renderTopbar({ onExportHtml, onExportWiki });

    await user.click(screen.getByRole('button', { name: 'HTML' }));
    await user.click(screen.getByRole('button', { name: 'Wiki' }));

    expect(onExportHtml).toHaveBeenCalledTimes(1);
    expect(onExportWiki).toHaveBeenCalledTimes(1);
  });

  it('opens full project preview actions from split button menus', async () => {
    const user = userEvent.setup();
    const onExportFullProjectHtml = vi.fn();
    const onExportFullProjectWiki = vi.fn();
    renderTopbar({ onExportFullProjectHtml, onExportFullProjectWiki });

    await user.click(screen.getByRole('button', { name: 'Опции экспорта HTML' }));
    await user.click(screen.getByRole('menuitem', { name: 'Весь проект' }));
    expect(onExportFullProjectHtml).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu', { name: 'Меню экспорта HTML' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Опции экспорта Wiki' }));
    await user.click(screen.getByRole('menuitem', { name: 'Весь проект' }));
    expect(onExportFullProjectWiki).toHaveBeenCalledTimes(1);
  });

  it('closes export split menu on outside click and Escape', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: 'Опции экспорта HTML' }));
    expect(screen.getByRole('menu', { name: 'Меню экспорта HTML' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside target' }));
    expect(screen.queryByRole('menu', { name: 'Меню экспорта HTML' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Опции экспорта Wiki' }));
    expect(screen.getByRole('menu', { name: 'Меню экспорта Wiki' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Меню экспорта Wiki' })).not.toBeInTheDocument();
  });
});

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
