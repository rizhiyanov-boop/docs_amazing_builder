import { useCallback, useEffect, useMemo, useState } from 'react';
import { WBButton } from '../components/primitives/WorkbenchPrimitives';
import { JiraPanel } from '../components/JiraPanel';
import { CONFLUENCE_BRIDGE_URL } from '../confluenceClient';
import { jiraClient, type JiraClient, type JiraStatus } from '../jiraClient';
import type { JiraDraft, JiraDraftInput } from '../jiraDraft';
import './ConfluenceScreen.css';

export type JiraStandaloneScreenProps = {
  onBack?: () => void;
  onBusyChange?: (busy: boolean) => void;
  client?: JiraClient;
  prepareDraft?: (input: JiraDraftInput) => Promise<JiraDraft>;
  isDirectStandalone?: boolean;
};

function standaloneTaskIdentity(key: string, renew = false) {
  try {
    const saved = localStorage.getItem(key);
    if (!renew && saved && /^task-[a-f0-9-]{36}$/.test(saved)) {
      return { id: saved, error: '' };
    }
    const id = `task-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
    return { id, error: '' };
  } catch {
    return { id: '', error: 'Не удалось сохранить идентификатор отдельной задачи. Разрешите локальное хранение перед созданием.' };
  }
}

export function JiraStandaloneScreen({
  onBack,
  onBusyChange,
  client = jiraClient,
  prepareDraft,
  isDirectStandalone = false
}: JiraStandaloneScreenProps) {
  const [busy, setBusy] = useState(false);
  const [completedIdentity, setCompletedIdentity] = useState('');
  const [taskRevision, setTaskRevision] = useState(0);
  const [status, setStatus] = useState<JiraStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkFeedback, setCheckFeedback] = useState<'success' | 'error' | null>(null);

  const key = 'docbuilder:jira-standalone:v1';
  const storedIdentity = useMemo(() => {
    void taskRevision;
    return standaloneTaskIdentity(key);
  }, [key, taskRevision]);

  const currentIdentity = `${key}:${storedIdentity.id}`;
  const completed = completedIdentity === currentIdentity;

  const setCompleted = useCallback((value: boolean) => {
    setCompletedIdentity(value ? currentIdentity : '');
  }, [currentIdentity]);

  const startNextTask = useCallback(() => {
    if (busy) return;
    standaloneTaskIdentity(key, true);
    setCompletedIdentity('');
    setTaskRevision(r => r + 1);
  }, [busy, key]);

  const handleBusyChange = useCallback((value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  }, [onBusyChange]);

  const loadStatus = useCallback(async () => {
    setChecking(true);
    try {
      const s = await client.status();
      setStatus(s);
      setCheckFeedback('success');
      window.setTimeout(() => setCheckFeedback(null), 2000);
    } catch {
      setStatus(null);
      setCheckFeedback('error');
      window.setTimeout(() => setCheckFeedback(null), 2000);
    } finally {
      setChecking(false);
    }
  }, [client]);

  useEffect(() => {
    let active = true;
    void client.status()
      .then(s => {
        if (!active) return;
        setStatus(s);
      })
      .catch(() => {
        if (!active) return;
        setStatus(null);
      })
      .finally(() => {
        if (!active) return;
        setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const isConnected = Boolean(status?.connected);

  return (
    <section className="cf-screen cf-jira-standalone-screen" aria-label="Jira">
      <header className="cf-header">
        <div>
          {onBack && !isDirectStandalone && (
            <button
              type="button"
              className="cf-back"
              aria-label="Назад в редактор"
              title="Назад в редактор"
              onClick={onBack}
              disabled={busy}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5m7-7-7 7 7 7" />
              </svg>
            </button>
          )}
          <h2>Jira</h2>
        </div>
        <div className="cf-connection">
          <WBButton
            size="sm"
            variant="ghost"
            aria-label="Проверить подключение"
            title={checking ? 'Проверка подключения…' : checkFeedback === 'success' ? 'Подключение активно' : checkFeedback === 'error' ? 'Ошибка проверки' : 'Проверить подключение'}
            className={`cf-connection-refresh-btn ${checkFeedback ? `is-${checkFeedback}` : ''}`}
            disabled={checking}
            onClick={() => void loadStatus()}
          >
            {checkFeedback === 'success' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M21 21v-5h-5" /></svg>
            )}
          </WBButton>
        </div>
      </header>

      {checking && !status ? (
        <div className="cf-jira-connect-card is-loading">
          <div className="cf-jira-connect-spinner" aria-hidden="true" />
          <p className="cf-muted" style={{ margin: 0 }}>Проверка подключения к Jira…</p>
        </div>
      ) : !isConnected ? (
        <div className="cf-jira-connect-card">
          <div className="cf-jira-connect-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.02L11.53 2zM6.77 6.8a4.36 4.36 0 0 0 4.34 4.34h1.8v1.72a4.36 4.36 0 0 0 4.34 4.34V6.8H6.77zM2 11.6a4.35 4.35 0 0 0 4.35 4.35h1.78v1.7c.01 2.4 1.95 4.34 4.35 4.35v-10.4H2z" />
            </svg>
          </div>
          <h3 className="cf-jira-connect-title">Подключите Jira</h3>
          <p className="cf-jira-connect-desc">
            Для заведения задач запустите локальное приложение DocBuilder с настроенным доступом к Jira.
          </p>
          <div className="cf-jira-connect-actions">
            <a
              href={`${CONFLUENCE_BRIDGE_URL}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="wb-button wb-button-primary wb-button-size-sm cf-jira-connect-action-link"
            >
              Открыть подключение
            </a>
            <a
              href="/docbuilder-confluence-local.zip"
              download
              className="wb-button wb-button-secondary wb-button-size-sm cf-jira-connect-action-link"
            >
              Скачать приложение (1.3.7)
            </a>
            <WBButton
              size="sm"
              variant="ghost"
              disabled={checking}
              onClick={() => void loadStatus()}
            >
              Проверить снова
            </WBButton>
          </div>
        </div>
      ) : storedIdentity.error ? (
        <p role="alert" className="cf-notice cf-error">{storedIdentity.error}</p>
      ) : (
        <JiraPanel
          key={storedIdentity.id}
          methodId={storedIdentity.id}
          methodName="Отдельная задача"
          methodContext=""
          source="freeform"
          active={true}
          onBusyChange={handleBusyChange}
          onCompletedChange={setCompleted}
          client={client}
          prepareDraft={prepareDraft}
          headerExtra={completed ? (
            <WBButton
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={startNextTask}
              aria-label="Завести ещё задачу"
            >
              + Завести ещё задачу
            </WBButton>
          ) : undefined}
        />
      )}
    </section>
  );
}
