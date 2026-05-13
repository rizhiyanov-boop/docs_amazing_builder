import React, { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { RequestMethod } from '../../types';
import { HttpChip, TabPill, TabsPill, WBButton } from '../primitives/WorkbenchPrimitives';

export type WorkbenchMode = 'workbench' | 'editor';
export type WorkbenchLayout = 'vertical' | 'grid';
export type WorkbenchAccent = 'blue' | 'warm' | 'violet';

type WorkbenchTopbarProps = {
  topbarRef: RefObject<HTMLElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  methodName: string;
  methodPath: string;
  methodHttpMethod: RequestMethod;
  mode: WorkbenchMode;
  layout: WorkbenchLayout;
  accent: WorkbenchAccent;
  authUserLogin: string | null;
  isLogoutBusy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onModeChange: (mode: WorkbenchMode) => void;
  onLayoutChange: (layout: WorkbenchLayout) => void;
  onAccentChange: (accent: WorkbenchAccent) => void;
  onOpenProjectImport: () => void;
  onImportProjectJson: (files: File[]) => void;
  onExportHtml: () => void;
  onExportWiki: () => void;
  onExportJson: () => void;
  onToggleSidebar: () => void;
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

export const WorkbenchTopbar = React.memo(function WorkbenchTopbar({
  topbarRef,
  importInputRef,
  methodName,
  methodPath,
  methodHttpMethod,
  mode,
  layout,
  accent,
  authUserLogin,
  isLogoutBusy,
  canUndo,
  canRedo,
  onModeChange,
  onLayoutChange,
  onAccentChange,
  onOpenProjectImport,
  onImportProjectJson,
  onExportHtml,
  onExportWiki,
  onExportJson,
  onToggleSidebar,
  onUndo,
  onRedo,
  onManualSave,
  onLogout,
  onOpenLogin,
  onOpenRegister
}: WorkbenchTopbarProps): ReactNode {
  const [themeOpen, setThemeOpen] = useState(false);
  const themePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!themeOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (themePanelRef.current && !themePanelRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setThemeOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [themeOpen]);

  return (
    <header
      ref={topbarRef}
      className="wb-topbar"
      style={{
        height: 48,
        minHeight: 48,
        borderBottom: '1px solid var(--wb-border)',
        background: 'var(--wb-bg-surface)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 10,
        color: 'var(--wb-text)',
        fontFamily: 'var(--wb-font-sans)'
      }}
    >
      <button
        type="button"
        className="wb-mobile-menu-button"
        aria-label="Открыть навигацию"
        title="Открыть навигацию"
        onClick={onToggleSidebar}
      >
        ☰
      </button>
      <HttpChip method={methodHttpMethod} size="sm" />
      <code style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--wb-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
        {methodName || 'Untitled method'}
      </code>
      <span style={{ width: 1, height: 20, background: 'var(--wb-border)' }} />
      <span style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 11, color: 'var(--wb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{methodPath || '/'}</span>

      <TabsPill>
        <TabPill value="workbench" active={mode === 'workbench'} onSelect={onModeChange}>Workbench</TabPill>
        <TabPill value="editor" active={mode === 'editor'} onSelect={onModeChange}>Editor</TabPill>
      </TabsPill>

      <TabsPill>
        <TabPill value="vertical" active={layout === 'vertical'} onSelect={onLayoutChange}>☰</TabPill>
        <TabPill value="grid" active={layout === 'grid'} onSelect={onLayoutChange}>⊞</TabPill>
      </TabsPill>

      <div style={{ flex: 1 }} />

      <div className="wb-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <WBButton variant="ghost" size="sm" onClick={onOpenProjectImport} aria-label="Импорт">Импорт</WBButton>
        <input
          ref={importInputRef}
          className="hidden-file-input"
          type="file"
          multiple
          accept="application/json"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            onImportProjectJson(files);
            event.currentTarget.value = '';
          }}
        />
        <WBButton variant="ghost" size="sm" onClick={onExportHtml}>HTML</WBButton>
        <WBButton variant="ghost" size="sm" onClick={onExportWiki}>Wiki</WBButton>
        <WBButton variant="secondary" size="sm" onClick={onExportJson}>JSON</WBButton>
      </div>

      <div className="wb-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <WBButton variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} title="Отменить">↶</WBButton>
        <WBButton variant="ghost" size="sm" onClick={onRedo} disabled={!canRedo} title="Повторить">↷</WBButton>
        <WBButton variant="ghost" size="sm" onClick={onManualSave} title="Сохранить">Сохранить</WBButton>
      </div>

      <div style={{ position: 'relative' }} ref={themePanelRef}>
        <button
          type="button"
          onClick={() => setThemeOpen((current) => !current)}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            border: '1px solid var(--wb-border-soft)',
            borderRadius: 999,
            padding: '3px 7px',
            background: 'var(--wb-bg-soft)',
            fontSize: 12
          }}
        >
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--wb-accent)', color: 'var(--wb-accent-fg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {(authUserLogin ?? 'U').slice(0, 1).toUpperCase()}
          </span>
          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{authUserLogin ?? 'Гость'}</span>
        </button>
        {themeOpen && (
          <div
            style={{
              position: 'absolute',
              top: 34,
              right: 0,
              zIndex: 20,
              width: 220,
              background: 'var(--wb-bg-surface)',
              border: '1px solid var(--wb-border)',
              borderRadius: 'var(--wb-radius)',
              boxShadow: 'var(--wb-shadow-pop)',
              padding: 10,
              display: 'grid',
              gap: 8
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--wb-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Тема</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
              {ACCENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onAccentChange(item.id);
                    setThemeOpen(false);
                  }}
                  style={{
                    border: `1px solid ${accent === item.id ? 'var(--wb-accent)' : 'var(--wb-border-soft)'}`,
                    background: accent === item.id ? 'var(--wb-accent-soft)' : 'var(--wb-bg-soft)',
                    color: 'var(--wb-text)',
                    borderRadius: 5,
                    padding: '5px 4px',
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {authUserLogin ? (
              <WBButton variant="danger" size="sm" onClick={onLogout} disabled={isLogoutBusy} fullWidth>{isLogoutBusy ? 'Выход...' : 'Logout'}</WBButton>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
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
