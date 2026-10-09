import React, { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { RequestMethod } from '../../types';
import { HttpChip, WBButton } from '../primitives/WorkbenchPrimitives';
import { confluenceClient } from '../../confluenceClient';
import { WORKBENCH_FEATURES } from '../../workbenchFeatures';
import { WorkbenchIcon, type WorkbenchIconName } from './WorkbenchIcon';

export type WorkbenchAccent = 'blue' | 'warm' | 'violet';
export type TopbarAutosaveState = 'idle' | 'saving' | 'saved' | 'error';

type WorkbenchTopbarProps = {
  disabled?: boolean;
  topbarRef: RefObject<HTMLElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  methodName: string;
  methodPath: string;
  methodHttpMethod: RequestMethod;
  authUserLogin: string | null;
  isLogoutBusy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  autosaveState: TopbarAutosaveState;
  autosaveAt?: string;
  onOpenProjectImport: () => void;
  onImportProjectJson: (files: File[]) => void;
  onExportHtml: () => void;
  onExportWiki: () => void;
  onOpenConfluence?: () => void;
  confluenceBound?: boolean;
  onExportFullProjectHtml: () => void;
  onExportFullProjectWiki: () => void;
  onExportJson: () => void;
  onToggleSidebar: () => void;
  isSidebarHidden?: boolean;
  onOpenSearch?: () => void;
  onRenameMethod: () => void;
  onDeleteMethod: () => void;
  canDeleteMethod: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onLogout: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

function IconButton({ label, icon, onClick, disabled, expanded, controls }: {
  label: string;
  icon: WorkbenchIconName;
  onClick: () => void;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
}): ReactNode {
  return (
    <button type="button" className="wb-topbar-icon-button" aria-label={label} title={label}
      aria-haspopup={controls ? 'menu' : undefined} aria-expanded={expanded} aria-controls={expanded ? controls : undefined}
      disabled={disabled} onClick={onClick}>
      <WorkbenchIcon name={icon} />
    </button>
  );
}

export const WorkbenchTopbar = React.memo(function WorkbenchTopbar({
  disabled, topbarRef, importInputRef, methodName, methodPath, methodHttpMethod, authUserLogin, isLogoutBusy,
  canUndo, canRedo, autosaveState, autosaveAt, onOpenProjectImport, onImportProjectJson, onExportHtml,
  onExportWiki, onOpenConfluence, confluenceBound, onExportFullProjectHtml, onExportFullProjectWiki,
  onExportJson, onToggleSidebar, onRenameMethod, onDeleteMethod, canDeleteMethod, onUndo, onRedo,
  onLogout, onOpenLogin, onOpenRegister, onOpenSearch, isSidebarHidden = false
}: WorkbenchTopbarProps): ReactNode {
  const [openMenu, setOpenMenu] = useState<'export' | 'more' | 'profile' | null>(null);
  const [confluenceConnected, setConfluenceConnected] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!onOpenSearch || disabled) return;
    const openMethodSearch = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.code !== 'KeyK') return;
      event.preventDefault();
      onOpenSearch();
    };
    document.addEventListener('keydown', openMethodSearch);
    return () => document.removeEventListener('keydown', openMethodSearch);
  }, [onOpenSearch, disabled]);

  useEffect(() => {
    if (!onOpenConfluence) return;
    let active = true;
    let pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try { const status = await confluenceClient.getStatus(); if (active) setConfluenceConnected(status.connected); }
      catch { if (active) setConfluenceConnected(false); }
      finally { pending = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [onOpenConfluence]);

  useEffect(() => {
    if (!openMenu) return;
    const anchor = (openMenu === 'export' ? exportRef : openMenu === 'more' ? overflowRef : profileRef).current;
    anchor?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const closeOutside = (event: MouseEvent) => {
      if (anchor && !anchor.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpenMenu(null);
      anchor?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.focus();
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [openMenu]);

  function navigateMenu(event: KeyboardEvent<HTMLDivElement>): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }

  const autosaveLabel = autosaveState === 'saving' ? 'Сохранение…'
    : autosaveState === 'error' ? 'Не сохранено'
      : autosaveState === 'saved' ? 'Сохранено' : 'Автосохранение';
  const autosaveTitle = autosaveState === 'error' ? 'Не удалось сохранить изменения в этом браузере'
    : `${autosaveLabel} в этом браузере${autosaveAt ? ` · ${autosaveAt}` : ''}`;
  const confluenceLabel = `Confluence${confluenceConnected ? ' · подключено' : ''}${confluenceBound ? ' · страница привязана' : ''}`;
  const runAction = (action: () => void) => { setOpenMenu(null); action(); };
  const toggleMenu = (menu: NonNullable<typeof openMenu>) => setOpenMenu((current) => current === menu ? null : menu);

  return (
    <header ref={topbarRef} className="wb-topbar" inert={disabled || undefined}>
      <button type="button" className="wb-mobile-menu-button" aria-label={isSidebarHidden ? 'Открыть навигацию' : 'Скрыть навигацию'} title={isSidebarHidden ? 'Открыть навигацию' : 'Скрыть навигацию'} aria-expanded={!isSidebarHidden} onClick={onToggleSidebar}><WorkbenchIcon name="menu" /></button>
      <div className="wb-topbar-context" aria-label="Текущий метод">
        <strong className="wb-topbar-method-name" title={methodName}>{methodName}</strong>
        <div className="wb-topbar-endpoint" title={`${methodHttpMethod} ${methodPath || '/'}`}>
          <HttpChip method={methodHttpMethod} size="sm" />
          <span>{methodPath || '/'}</span>
        </div>
      </div>

      <div className="wb-topbar-actions">
        {onOpenSearch && <IconButton label="Перейти к методу (Ctrl+K)" icon="search" onClick={onOpenSearch} />}
        <div className={`wb-topbar-autosave ${autosaveState}`} role="status" aria-label={autosaveTitle} title={autosaveTitle}>
          <WorkbenchIcon name={autosaveState === 'error' ? 'alert' : autosaveState === 'saving' || autosaveState === 'idle' ? 'spinner' : 'check'} />
          <span className="wb-autosave-label">{autosaveLabel}</span>
        </div>
        <div className="wb-topbar-history" role="group" aria-label="История изменений">
          <IconButton label="Отменить" icon="undo" onClick={onUndo} disabled={!canUndo} />
          <IconButton label="Повторить" icon="redo" onClick={onRedo} disabled={!canRedo} />
        </div>

        <div className="wb-topbar-popover-anchor" ref={exportRef}>
          <button type="button" className="wb-topbar-action" aria-label="Экспорт" aria-haspopup="menu" aria-expanded={openMenu === 'export'}
            aria-controls={openMenu === 'export' ? `${menuId}-export` : undefined} onClick={() => toggleMenu('export')}>
            <WorkbenchIcon name="export" /><span className="wb-topbar-action-label">Экспорт</span><WorkbenchIcon name="chevron" />
          </button>
          {openMenu === 'export' && (
            <div id={`${menuId}-export`} className="wb-topbar-menu wb-export-menu" role="menu" aria-label="Экспорт" onKeyDown={navigateMenu}>
              <span className="wb-menu-heading" role="presentation">Текущий метод</span>
              <button type="button" role="menuitem" aria-label="HTML" onClick={() => runAction(onExportHtml)}><WorkbenchIcon name="html" /><span><strong>HTML</strong><small>Предпросмотр и скачивание</small></span></button>
              <button type="button" role="menuitem" aria-label="Wiki" onClick={() => runAction(onExportWiki)}><WorkbenchIcon name="wiki" /><span><strong>Wiki</strong><small>Разметка Confluence</small></span></button>
              <span className="wb-topbar-menu-divider" role="separator" />
              <button type="button" role="menuitem" aria-label="JSON" onClick={() => runAction(onExportJson)}><WorkbenchIcon name="json" /><span><strong>JSON</strong><small>Сохранить все методы в файл</small></span></button>
            </div>
          )}
        </div>

        {onOpenConfluence && (
          <button type="button" className={`wb-topbar-action wb-topbar-publish${confluenceConnected ? ' is-connected' : ''}`} aria-label={confluenceLabel} title={confluenceLabel} onClick={onOpenConfluence}>
            <WorkbenchIcon name="confluence" /><span className="wb-topbar-action-label">Confluence</span>
            {confluenceConnected && <span className="wb-connection-dot" aria-hidden="true" />}
          </button>
        )}

        <div className="wb-topbar-popover-anchor" ref={overflowRef}>
          <IconButton label="Дополнительные действия" icon="more" expanded={openMenu === 'more'} controls={`${menuId}-more`} onClick={() => toggleMenu('more')} />
          {openMenu === 'more' && (
            <div id={`${menuId}-more`} className="wb-topbar-menu" role="menu" aria-label="Дополнительные действия" onKeyDown={navigateMenu}>
              <button type="button" role="menuitem" onClick={() => runAction(onOpenProjectImport)}>Импорт</button>
              <a role="menuitem" href={`${import.meta.env.BASE_URL}docbuilder-ai-method-template.json`} download="docbuilder-ai-method-template.json" onClick={() => setOpenMenu(null)}>Скачать шаблон метода для ИИ</a>
              {WORKBENCH_FEATURES.projects && <a role="menuitem" href={`${import.meta.env.BASE_URL}docbuilder-ai-project-template.json`} download="docbuilder-ai-project-template.json" onClick={() => setOpenMenu(null)}>Скачать шаблон проекта для ИИ</a>}
              <span className="wb-topbar-menu-divider" role="separator" />
              <button type="button" role="menuitem" onClick={() => runAction(onRenameMethod)}>Переименовать метод</button>
              <button type="button" role="menuitem" disabled={!canDeleteMethod} className="danger" onClick={() => runAction(onDeleteMethod)}>Удалить метод</button>
              {WORKBENCH_FEATURES.projects && <>
                <span className="wb-topbar-menu-divider" role="separator" />
                <button type="button" role="menuitem" onClick={() => runAction(onExportFullProjectHtml)}>Проект HTML</button>
                <button type="button" role="menuitem" onClick={() => runAction(onExportFullProjectWiki)}>Проект Wiki</button>
              </>}
            </div>
          )}
        </div>

        <div className="wb-topbar-popover-anchor" ref={profileRef}>
          <button type="button" className="wb-topbar-profile" aria-label={`Аккаунт: ${authUserLogin ?? 'Гость'}`} title={authUserLogin ?? 'Войти в аккаунт'}
            aria-haspopup="menu" aria-expanded={openMenu === 'profile'} aria-controls={openMenu === 'profile' ? `${menuId}-profile` : undefined} onClick={() => toggleMenu('profile')}>
            <span aria-hidden="true">{(authUserLogin ?? 'U').slice(0, 1).toUpperCase()}</span>
          </button>
          {openMenu === 'profile' && (
            <div id={`${menuId}-profile`} className="wb-topbar-menu wb-topbar-profile-panel" role="menu" aria-label="Аккаунт" onKeyDown={navigateMenu}>
              <span className="wb-menu-heading" role="presentation">{authUserLogin ?? 'Гостевой режим'}</span>
              {authUserLogin ? (
                <WBButton role="menuitem" variant="danger" size="sm" onClick={() => runAction(onLogout)} disabled={isLogoutBusy} fullWidth>{isLogoutBusy ? 'Выход…' : 'Выйти'}</WBButton>
              ) : <>
                <WBButton role="menuitem" variant="secondary" size="sm" onClick={() => runAction(onOpenLogin)} fullWidth>Войти</WBButton>
                <WBButton role="menuitem" variant="accent" size="sm" onClick={() => runAction(onOpenRegister)} fullWidth>Регистрация</WBButton>
              </>}
            </div>
          )}
        </div>
      </div>

      <input ref={importInputRef} className="hidden-file-input" type="file" multiple accept="application/json,application/xml,text/xml,text/plain,.json,.xml,.txt"
        onChange={(event) => { onImportProjectJson(Array.from(event.target.files ?? [])); event.currentTarget.value = ''; }} />
    </header>
  );
});
