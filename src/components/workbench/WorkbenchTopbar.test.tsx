import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchTopbar } from './WorkbenchTopbar';

vi.mock('../../workbenchFeatures', () => ({ WORKBENCH_FEATURES: { projects: true } }));

afterEach(cleanup);

function renderTopbar(overrides: Partial<React.ComponentProps<typeof WorkbenchTopbar>> = {}) {
  const props: React.ComponentProps<typeof WorkbenchTopbar> = {
    topbarRef: React.createRef<HTMLElement>(),
    importInputRef: React.createRef<HTMLInputElement>(),
    methodName: 'Create order',
    methodPath: '/orders',
    methodHttpMethod: 'POST',
    authUserLogin: 'User',
    isLogoutBusy: false,
    canUndo: true,
    canRedo: false,
    autosaveState: 'saved',
    autosaveAt: '10:30',
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
    onLogout: vi.fn(),
    onOpenLogin: vi.fn(),
    onOpenRegister: vi.fn(),
    ...overrides
  };
  return { props, ...render(<WorkbenchTopbar {...props} />) };
}

describe('WorkbenchTopbar', () => {
  it('renders the action order and autosave status without split, theme, save or search controls', () => {
    renderTopbar();
    const topbar = screen.getByRole('banner');
    expect(within(topbar).getByLabelText('doc-builder')).toHaveTextContent('dbdoc-builder');
    expect(within(topbar).getByText('/orders')).toBeInTheDocument();
    expect(within(topbar).getByRole('button', { name: 'JSON' })).toBeInTheDocument();
    expect(within(topbar).getByRole('button', { name: 'HTML' })).toBeInTheDocument();
    expect(within(topbar).getByRole('button', { name: 'Wiki' })).toBeInTheDocument();
    expect(within(topbar).queryByRole('button', { name: /Сплит-режим/ })).not.toBeInTheDocument();
    expect(within(topbar).queryByRole('button', { name: 'Переключить тему' })).not.toBeInTheDocument();
    expect(within(topbar).queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
    expect(within(topbar).queryByRole('button', { name: 'Поиск (Ctrl+K)' })).not.toBeInTheDocument();
    expect(within(topbar).getByRole('status')).toHaveTextContent('Сохранено · 10:30');
  });

  it('runs export and history actions', async () => {
    const user = userEvent.setup();
    const result = renderTopbar();
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    await user.click(screen.getByRole('button', { name: 'HTML' }));
    await user.click(screen.getByRole('button', { name: 'Wiki' }));
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(result.props.onExportJson).toHaveBeenCalledOnce();
    expect(result.props.onExportHtml).toHaveBeenCalledOnce();
    expect(result.props.onExportWiki).toHaveBeenCalledOnce();
    expect(result.props.onUndo).toHaveBeenCalledOnce();
  });

  it('moves import, method actions and project exports into overflow', async () => {
    const user = userEvent.setup();
    const result = renderTopbar();
    expect(screen.queryByRole('button', { name: 'Импорт' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дополнительные действия' }));
    const menu = screen.getByRole('menu', { name: 'Дополнительные действия' });
    const templateLink = within(menu).getByRole('menuitem', { name: 'Скачать шаблон метода для ИИ' });
    expect(templateLink).toHaveAttribute('href', `${import.meta.env.BASE_URL}docbuilder-ai-method-template.json`);
    expect(templateLink).toHaveAttribute('download', 'docbuilder-ai-method-template.json');
    const projectTemplateLink = within(menu).getByRole('menuitem', { name: 'Скачать шаблон проекта для ИИ' });
    expect(projectTemplateLink).toHaveAttribute('href', `${import.meta.env.BASE_URL}docbuilder-ai-project-template.json`);
    expect(projectTemplateLink).toHaveAttribute('download', 'docbuilder-ai-project-template.json');
    await user.click(within(menu).getByRole('menuitem', { name: 'Импорт' }));
    expect(result.props.onOpenProjectImport).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Дополнительные действия' }));
    await user.click(screen.getByRole('menuitem', { name: 'Проект HTML' }));
    expect(result.props.onExportFullProjectHtml).toHaveBeenCalledOnce();
  });

  it('opens Confluence without confusing the binding with the project autosave state', async () => {
    const onOpenConfluence = vi.fn();
    renderTopbar({ onOpenConfluence, confluenceBound: true });
    await userEvent.setup().click(screen.getByRole('button', { name: /Confluence/ }));
    expect(onOpenConfluence).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Confluence.*страница привязана/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Сохранено');
  });

  it('keeps profile auth controls without accent controls', async () => {
    const user = userEvent.setup();
    renderTopbar();
    await user.click(screen.getByRole('button', { name: /User/ }));
    expect(screen.queryByText('Акцент')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dusk' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });
});
