import type { RefObject } from 'react';

type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';
type AutosaveInfo = { state: AutosaveState; at?: string };

type AppHeaderProps = {
  topbarRef: RefObject<HTMLElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  resetProject: () => void;
  openProjectImportDialog: (fromOnboarding?: boolean) => void;
  importProjectJson: (file?: File) => void;
  exportProjectJson: () => void;
  handleExportHtml: () => Promise<void>;
  handleExportWiki: () => Promise<void>;
  activeMethod: unknown;
  exportTitle: string;
  toggleTheme: () => void;
  theme: 'light' | 'dark';
  autosave: AutosaveInfo;
};

export function AppHeader({
  topbarRef,
  importInputRef,
  resetProject,
  openProjectImportDialog,
  importProjectJson,
  exportProjectJson,
  handleExportHtml,
  handleExportWiki,
  activeMethod,
  exportTitle,
  toggleTheme,
  theme,
  autosave
}: AppHeaderProps) {
  return (
    <header ref={topbarRef} className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden>
          API
        </span>
        <div>
          <h1>Doc Builder</h1>
        </div>
      </div>
      <div className="actions">
        <div className="actions-main">
          <button className="ghost" data-testid="new-endpoint-button" onClick={resetProject}>
            Новый эндпоинт
          </button>
          <button className="ghost" data-testid="import-project-button" type="button" onClick={() => openProjectImportDialog(false)}>
            Импорт
          </button>
          <input
            ref={importInputRef}
            className="hidden-file-input"
            type="file"
            accept="application/json"
            onChange={(e) => importProjectJson(e.target.files?.[0])}
          />
          <button className="ghost" data-testid="export-json-button" onClick={exportProjectJson} disabled={!activeMethod} title={exportTitle}>
            Экспорт JSON
          </button>
          <button data-testid="export-html-button" data-onboarding-anchor="export-docs" onClick={() => void handleExportHtml()} disabled={!activeMethod} title={exportTitle}>
            Экспорт HTML
          </button>
          <button data-testid="export-wiki-button" onClick={() => void handleExportWiki()} disabled={!activeMethod} title={exportTitle}>
            Экспорт Wiki
          </button>
        </div>
        <div className="actions-side">
          <button
            type="button"
            className="theme-mermaid-toggle"
            data-testid="theme-toggle-button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить ночную тему'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <span className="theme-mermaid-orb" aria-hidden />
            <span className="theme-mermaid-icon" aria-hidden>
              {theme === 'dark' ? '☾' : '☀'}
            </span>
          </button>
          <div
            className={`badge autosave-badge ${autosave.state}`}
            aria-live="polite"
            title={autosave.state === 'saved' ? 'Автосохранение выполнено' : undefined}
          >
            {autosave.state === 'saving' && 'Сохранение...'}
            {autosave.state === 'saved' && (
              <>
                <span className="status-icon" aria-hidden />
                <span className="status-time">{autosave.at ?? '--:--'}</span>
              </>
            )}
            {autosave.state === 'error' && 'Ошибка сохранения'}
            {autosave.state === 'idle' && 'Готово'}
          </div>
        </div>
      </div>
    </header>
  );
}
