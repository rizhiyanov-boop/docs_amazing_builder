import React, { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { RequestMethod } from '../../types';
import { HttpChip, WBButton } from '../primitives/WorkbenchPrimitives';

export type WorkbenchAccent = 'blue' | 'warm' | 'violet';
export type TopbarAutosaveState = 'idle' | 'saving' | 'saved' | 'error';

type WorkbenchTopbarProps = {
  topbarRef: RefObject<HTMLElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  methodName: string;
  methodPath: string;
  methodHttpMethod: RequestMethod;
  accent: WorkbenchAccent;
  authUserLogin: string | null;
  isLogoutBusy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  splitOpen: boolean;
  splitAvailable: boolean;
  autosaveState: TopbarAutosaveState;
  autosaveAt?: string;
  onAccentChange: (accent: WorkbenchAccent) => void;
  onOpenProjectImport: () => void;
  onImportProjectJson: (files: File[]) => void;
  onExportHtml: () => void;
  onExportWiki: () => void;
  onExportFullProjectHtml: () => void;
  onExportFullProjectWiki: () => void;
  onExportJson: () => void;
  onToggleSidebar: () => void;
  onToggleSplit: () => void;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
  onRenameMethod: () => void;
  onDeleteMethod: () => void;
  canDeleteMethod: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onManualSave: () => void;
  onLogout: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
};

const ACCENTS: Array<{ id: WorkbenchAccent; label: string }> = [
  { id: 'blue', label: 'Daylight' },
  { id: 'warm', label: 'Kraft' },
  { id: 'violet', label: 'Dusk' }
];

function Icon({ name }: { name: 'json' | 'html' | 'wiki' | 'undo' | 'redo' | 'split' | 'search' | 'theme' | 'more' }): ReactNode {
  if (name === 'json') return <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 20V4" /></svg>;
  if (name === 'html') return <svg viewBox="0 0 24 24"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></svg>;
  if (name === 'wiki') return <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>;
  if (name === 'undo') return <svg viewBox="0 0 24 24"><path d="M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>;
  if (name === 'redo') return <svg viewBox="0 0 24 24"><path d="M21 7v6h-6M3 17a9 9 0 0 1 15-6.7l3 2.7" /></svg>;
  if (name === 'split') return <svg viewBox="0 0 16 16"><rect x="1" y="2" width="5.5" height="12" rx="1.2" /><rect x="9.5" y="2" width="5.5" height="12" rx="1.2" /></svg>;
  if (name === 'search') return <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>;
  if (name === 'theme') return <svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" /></svg>;
  return <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>;
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  active
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}): ReactNode {
  return (
    <button
      type="button"
      className={`wb-topbar-icon-button ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={icon === 'split' ? active : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

export const WorkbenchTopbar = React.memo(function WorkbenchTopbar({
  topbarRef,
  importInputRef,
  methodName,
  methodPath,
  methodHttpMethod,
  accent,
  authUserLogin,
  isLogoutBusy,
  canUndo,
  canRedo,
  splitOpen,
  splitAvailable,
  autosaveState,
  autosaveAt,
  onAccentChange,
  onOpenProjectImport,
  onImportProjectJson,
  onExportHtml,
  onExportWiki,
  onExportFullProjectHtml,
  onExportFullProjectWiki,
  onExportJson,
  onToggleSidebar,
  onToggleSplit,
  onToggleTheme,
  onOpenSearch,
  onRenameMethod,
  onDeleteMethod,
  canDeleteMethod,
  onUndo,
  onRedo,
  onManualSave,
  onLogout,
  onOpenLogin,
  onOpenRegister
}: WorkbenchTopbarProps): ReactNode {
  const [profileOpen, setProfileOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen && !overflowOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (profileOpen && profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
      if (overflowOpen && overflowRef.current && !overflowRef.current.contains(event.target as Node)) setOverflowOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [overflowOpen, profileOpen]);

  const autosaveLabel =
    autosaveState === 'saving'
      ? 'Сохранение…'
      : autosaveState === 'error'
        ? 'Ошибка сохранения'
        : autosaveState === 'saved'
          ? `Сохранено${autosaveAt ? ` · ${autosaveAt}` : ''}`
          : 'Изменения сохранены';

  const runOverflowAction = (action: () => void) => {
    setOverflowOpen(false);
    action();
  };

  return (
    <header ref={topbarRef} className="wb-topbar">
      <button type="button" className="wb-mobile-menu-button" aria-label="Открыть навигацию" onClick={onToggleSidebar}>☰</button>

      <div className="wb-topbar-brand" aria-label="doc-builder">
        <span className="wb-topbar-mark">db</span>
        <span className="wb-topbar-name">doc-builder</span>
      </div>
      <span className="wb-topbar-divider" />

      <div className="wb-topbar-crumb" title={methodName}>
        <HttpChip method={methodHttpMethod} size="sm" />
        <code>{methodPath || '/'}</code>
        <span>/</span>
      </div>
      <span className="wb-topbar-divider" />

      <div className="wb-topbar-tools" aria-label="Экспорт и история">
        <IconButton label="JSON" icon="json" onClick={onExportJson} />
        <IconButton label="HTML" icon="html" onClick={onExportHtml} />
        <IconButton label="Wiki" icon="wiki" onClick={onExportWiki} />
        <span className="wb-topbar-divider" />
        <IconButton label="Отменить" icon="undo" onClick={onUndo} disabled={!canUndo} />
        <IconButton label="Повторить" icon="redo" onClick={onRedo} disabled={!canRedo} />
        <span className="wb-topbar-divider" />
        <IconButton
          label={splitAvailable ? 'Сплит-режим (Ctrl+\\)' : 'Сплит-режим недоступен на узком экране'}
          icon="split"
          onClick={onToggleSplit}
          disabled={!splitAvailable}
          active={splitOpen}
        />
      </div>

      <div className={`wb-topbar-autosave ${autosaveState}`} role="status">
        <span aria-hidden>{autosaveState === 'error' ? '!' : autosaveState === 'saving' ? '…' : '✓'}</span>
        {autosaveLabel}
      </div>

      <button type="button" className="wb-topbar-save" onClick={onManualSave}>Сохранить</button>
      <IconButton label="Поиск (Ctrl+K)" icon="search" onClick={onOpenSearch} />
      <IconButton label="Переключить тему" icon="theme" onClick={onToggleTheme} />

      <div className="wb-topbar-popover-anchor" ref={overflowRef}>
        <IconButton label="Дополнительные действия" icon="more" onClick={() => setOverflowOpen((current) => !current)} />
        {overflowOpen && (
          <div className="wb-topbar-menu" role="menu" aria-label="Дополнительные действия">
            <button type="button" role="menuitem" onClick={() => runOverflowAction(onOpenProjectImport)}>Импорт</button>
            <button type="button" role="menuitem" onClick={() => runOverflowAction(onRenameMethod)}>Переименовать метод</button>
            <button
              type="button"
              role="menuitem"
              disabled={!canDeleteMethod}
              className="danger"
              onClick={() => runOverflowAction(onDeleteMethod)}
            >
              Удалить метод
            </button>
            <span className="wb-topbar-menu-divider" />
            <button type="button" role="menuitem" onClick={() => runOverflowAction(onExportFullProjectHtml)}>Проект HTML</button>
            <button type="button" role="menuitem" onClick={() => runOverflowAction(onExportFullProjectWiki)}>Проект Wiki</button>
          </div>
        )}
      </div>

      <input
        ref={importInputRef}
        className="hidden-file-input"
        type="file"
        multiple
        accept="application/json,application/xml,text/xml,text/plain,.json,.xml,.txt"
        onChange={(event) => {
          onImportProjectJson(Array.from(event.target.files ?? []));
          event.currentTarget.value = '';
        }}
      />

      <div className="wb-topbar-popover-anchor" ref={profileRef}>
        <button type="button" className="wb-topbar-profile" onClick={() => setProfileOpen((current) => !current)}>
          <span>{(authUserLogin ?? 'U').slice(0, 1).toUpperCase()}</span>
          <span>{authUserLogin ?? 'Гость'}</span>
        </button>
        {profileOpen && (
          <div className="wb-topbar-profile-panel">
            <div className="wb-topbar-panel-label">Акцент</div>
            <div className="wb-topbar-accents">
              {ACCENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={accent === item.id ? 'active' : ''}
                  onClick={() => {
                    onAccentChange(item.id);
                    setProfileOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {authUserLogin ? (
              <WBButton variant="danger" size="sm" onClick={onLogout} disabled={isLogoutBusy} fullWidth>
                {isLogoutBusy ? 'Выход…' : 'Выйти'}
              </WBButton>
            ) : (
              <div className="wb-topbar-auth-actions">
                <WBButton variant="secondary" size="sm" onClick={onOpenLogin} fullWidth>Войти</WBButton>
                <WBButton variant="accent" size="sm" onClick={onOpenRegister} fullWidth>Регистрация</WBButton>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
});
