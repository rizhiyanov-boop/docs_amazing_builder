import type { ReactNode, RefObject } from 'react';
import type { OnboardingStepId } from '../onboarding/steps';

export type OnboardingStepViewModel = {
  id: OnboardingStepId;
  title: string;
  description: string;
};

type TopbarAutosaveState = 'idle' | 'saving' | 'saved' | 'error';

type AppTopbarProps = {
  topbarRef: RefObject<HTMLElement | null>;
  importInputRef: RefObject<HTMLInputElement | null>;
  canExport: boolean;
  exportTitle: string;
  authLoading: boolean;
  authUserLogin: string | null;
  canUndo: boolean;
  canRedo: boolean;
  isOnboardingHeaderAvailable: boolean;
  isOnboardingNavVisible: boolean;
  isSidebarHidden: boolean;
  theme: 'light' | 'dark';
  autosaveState: TopbarAutosaveState;
  autosaveAt: string | null;
  isLogoutBusy: boolean;
  onboardingSteps: readonly OnboardingStepViewModel[];
  onboardingStepCompleted: Record<OnboardingStepId, boolean>;
  activeOnboardingStepId: OnboardingStepId;
  onboardingStepHint: string;
  onboardingPrimaryActionLabel: string;
  onOpenProjectImport: () => void;
  onImportProjectJson: (files: File[]) => void;
  onExportProjectJson: () => void;
  onExportMockServiceJson: () => void;
  onExportFullProjectHtml: () => void;
  onExportFullProjectWiki: () => void;
  onOpenHtmlPreview: () => void;
  onOpenWikiPreview: () => void;
  onUndoWorkspace: () => void;
  onRedoWorkspace: () => void;
  onLogout: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onToggleOnboardingHeaderNavigation: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onManualSave: () => void;
  onJumpToOnboardingStep: (stepId: OnboardingStepId) => void;
  onPrimaryOnboardingAction: () => void;
  canNavigateToOnboardingStep: (stepId: OnboardingStepId) => { allowed: boolean; reason?: string };
  renderUiIcon: (name: string) => ReactNode;
};

export function AppTopbar({
  topbarRef,
  importInputRef,
  canExport,
  exportTitle,
  authLoading,
  authUserLogin,
  canUndo,
  canRedo,
  isOnboardingHeaderAvailable,
  isOnboardingNavVisible,
  isSidebarHidden,
  theme,
  autosaveState,
  autosaveAt,
  isLogoutBusy,
  onboardingSteps,
  onboardingStepCompleted,
  activeOnboardingStepId,
  onboardingStepHint,
  onboardingPrimaryActionLabel,
  onOpenProjectImport,
  onImportProjectJson,
  onExportProjectJson,
  onExportMockServiceJson,
  onExportFullProjectHtml,
  onExportFullProjectWiki,
  onOpenHtmlPreview,
  onOpenWikiPreview,
  onUndoWorkspace,
  onRedoWorkspace,
  onLogout,
  onOpenLogin,
  onOpenRegister,
  onToggleOnboardingHeaderNavigation,
  onToggleSidebar,
  onToggleTheme,
  onManualSave,
  onJumpToOnboardingStep,
  onPrimaryOnboardingAction,
  canNavigateToOnboardingStep,
  renderUiIcon
}: AppTopbarProps): ReactNode {
  // Autosave stays wired for now, but hidden from topbar UI by product request.
  void autosaveState;
  void autosaveAt;
  void onManualSave;

  return (
    <header ref={topbarRef} className="topbar">
      <div className="topbar-context">
        <div className="brand">
          <span className="logo" aria-hidden>
            API
          </span>
          <div>
            <h1>Doc Builder</h1>
          </div>
        </div>
      </div>
      <div className="actions">
        <div className="actions-main topbar-cluster" aria-label="Импорт и экспорт">
          <button className="ghost topbar-action" type="button" onClick={onOpenProjectImport} aria-label="Импорт" title="Импорт">
            <span className="ui-icon" aria-hidden>{renderUiIcon('import')}</span>
          </button>
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
          <button
            className="ghost topbar-action topbar-format-btn"
            onClick={onExportProjectJson}
            disabled={!canExport}
            title={canExport ? `Скачать JSON. ${exportTitle}` : exportTitle}
            aria-label="Скачать JSON"
          >
            <span className="ui-icon export-format-icon" data-format="JSON" aria-hidden>{renderUiIcon('download')}</span>
          </button>
          <button
            className="ghost topbar-action topbar-format-btn"
            onClick={onExportMockServiceJson}
            disabled={!canExport}
            title={canExport ? `Скачать mock-service JSON. ${exportTitle}` : exportTitle}
            aria-label="Скачать mock-service JSON"
          >
            <span className="ui-icon export-format-icon" data-format="MOCK" aria-hidden>{renderUiIcon('download')}</span>
          </button>
          <button
            className="primary topbar-action topbar-format-btn"
            data-onboarding-anchor="export-docs"
            onClick={onOpenHtmlPreview}
            disabled={!canExport}
            title={canExport ? `Открыть HTML-предпросмотр. ${exportTitle}` : exportTitle}
            aria-label="Открыть HTML-предпросмотр"
          >
            <span className="ui-icon export-format-icon" data-format="HTML" aria-hidden>{renderUiIcon('download')}</span>
          </button>
          <button
            className="topbar-action topbar-format-btn"
            onClick={onOpenWikiPreview}
            disabled={!canExport}
            title={canExport ? `Открыть Wiki-предпросмотр. ${exportTitle}` : exportTitle}
            aria-label="Открыть Wiki-предпросмотр"
          >
            <span className="ui-icon export-format-icon" data-format="WIKI" aria-hidden>{renderUiIcon('download')}</span>
          </button>
          <button
            className="ghost small"
            type="button"
            onClick={onExportFullProjectHtml}
            disabled={!canExport}
            title={canExport ? 'Скачать полный проект в HTML' : exportTitle}
          >
            Проект HTML
          </button>
          <button
            className="ghost small"
            type="button"
            onClick={onExportFullProjectWiki}
            disabled={!canExport}
            title={canExport ? 'Скачать полный проект в Wiki' : exportTitle}
          >
            Проект Wiki
          </button>
        </div>
        <div className="actions-side">
          <div className="topbar-cluster topbar-history-cluster">
            <div className="history-controls" role="group" aria-label="История изменений">
              <button type="button" className="ghost history-btn" onClick={onUndoWorkspace} disabled={!canUndo} title="Отменить (Ctrl+Z)">
                <span className="ui-icon" aria-hidden>{renderUiIcon('undo')}</span>
              </button>
              <button type="button" className="ghost history-btn" onClick={onRedoWorkspace} disabled={!canRedo} title="Повторить (Ctrl+Shift+Z / Ctrl+Y)">
                <span className="ui-icon" aria-hidden>{renderUiIcon('redo')}</span>
              </button>
            </div>
          </div>
          <div className="topbar-cluster topbar-system-cluster">
            {authLoading ? (
              <span className="badge topbar-auth-pending">
                <span className="ai-loader ai-loader-inline" aria-hidden="true" />
                <span>Проверка входа...</span>
              </span>
            ) : authUserLogin ? (
              <>
                <span className="topbar-user-pill" title={authUserLogin}>
                  <span className="ui-icon topbar-user-icon" aria-hidden>{renderUiIcon('user')}</span>
                  <span className="topbar-user-name">{authUserLogin}</span>
                </span>
                <button type="button" className="ghost small" onClick={onLogout} disabled={isLogoutBusy} aria-busy={isLogoutBusy}>
                  {isLogoutBusy ? (
                    <>
                      <span className="ai-loader ai-loader-inline" aria-hidden="true" />
                      <span>Выход...</span>
                    </>
                  ) : (
                    'Выйти'
                  )}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ghost small" onClick={onOpenLogin}>
                  Войти
                </button>
                <button type="button" className="ghost small" onClick={onOpenRegister}>
                  Регистрация
                </button>
              </>
            )}
            {isOnboardingHeaderAvailable && (
              <button
                type="button"
                className={`onboarding-nav-toggle ${isOnboardingNavVisible ? 'active' : ''}`}
                onClick={onToggleOnboardingHeaderNavigation}
                aria-label={isOnboardingNavVisible ? 'Скрыть панель навигации' : 'Показать панель навигации'}
                title={isOnboardingNavVisible ? 'Скрыть панель навигации' : 'Показать панель навигации'}
              >
                <span className="ui-icon onboarding-nav-icon" aria-hidden>{renderUiIcon('onboarding_nav')}</span>
              </button>
            )}
            <button
              type="button"
              className={`onboarding-nav-toggle ${!isSidebarHidden ? 'active' : ''}`}
              onClick={onToggleSidebar}
              aria-label={isSidebarHidden ? 'Показать боковую панель' : 'Скрыть боковую панель'}
              title={isSidebarHidden ? 'Показать боковую панель' : 'Скрыть боковую панель'}
            >
              <span className="ui-icon onboarding-nav-icon" aria-hidden>{renderUiIcon('sidebar_panel')}</span>
            </button>
            <button
              type="button"
              className="theme-mermaid-toggle"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить ночную тему'}
              title={theme === 'dark' ? 'Включить светлую тему' : 'Включить ночную тему'}
            >
              <span className="ui-icon" aria-hidden>{renderUiIcon(theme === 'dark' ? 'theme_sun' : 'theme_moon')}</span>
            </button>
          </div>
        </div>
      </div>

      {isOnboardingHeaderAvailable && isOnboardingNavVisible && (
        <section
          className="onboarding-stepbar collapsed in-topbar"
          data-onboarding-anchor="prepare-source"
          aria-live="polite"
          aria-label="Пошаговая навигация"
        >
          <div className="onboarding-stepbar-track" role="list" aria-label="Прогресс шагов">
            {onboardingSteps.map((step) => {
              const isDone = onboardingStepCompleted[step.id] ?? false;
              const isCurrent = step.id === activeOnboardingStepId;
              const access = canNavigateToOnboardingStep(step.id);
              return (
                <button
                  key={step.id}
                  type="button"
                  role="listitem"
                  className={`onboarding-step-chip ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${access.allowed ? 'available' : 'blocked'}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={!access.allowed}
                  disabled={!access.allowed}
                  title={access.allowed ? step.description : access.reason}
                  onClick={() => onJumpToOnboardingStep(step.id)}
                >
                  <span aria-hidden="true">{isDone ? '[x] ' : '[ ] '}</span>
                  {step.title}
                </button>
              );
            })}
          </div>
          {onboardingStepHint && <div className="onboarding-stepbar-tip">{onboardingStepHint}</div>}
          <div className="onboarding-stepbar-actions">
            <button
              type="button"
              className="small onboarding-stepbar-icon-btn primary"
              aria-label={onboardingPrimaryActionLabel}
              title={onboardingPrimaryActionLabel}
              onClick={onPrimaryOnboardingAction}
            >
              <svg className="onboarding-eye-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M2 12c2.4-4 5.8-6 10-6s7.6 2 10 6c-2.4 4-5.8 6-10 6s-7.6-2-10-6Z" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            </button>
          </div>
        </section>
      )}
    </header>
  );
}
