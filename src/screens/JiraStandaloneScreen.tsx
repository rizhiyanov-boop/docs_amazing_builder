import { useCallback, useEffect, useMemo, useState } from 'react';
import { WBButton } from '../components/primitives/WorkbenchPrimitives';
import { JiraPanel } from '../components/JiraPanel';
import { CONFLUENCE_BRIDGE_URL } from '../confluenceClient';
import { jiraClient, type JiraClient, type JiraStatus } from '../jiraClient';
import type { JiraDraft, JiraDraftInput } from '../jiraDraft';
import './ConfluenceScreen.css';

export type JiraStandaloneScreenProps = {
  onBack: () => void;
  onBusyChange?: (busy: boolean) => void;
  client?: JiraClient;
  prepareDraft?: (input: JiraDraftInput) => Promise<JiraDraft>;
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
  prepareDraft
}: JiraStandaloneScreenProps) {
  const [busy, setBusy] = useState(false);
  const [completedIdentity, setCompletedIdentity] = useState('');
  const [taskRevision, setTaskRevision] = useState(0);
  const [status, setStatus] = useState<JiraStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkFeedback, setCheckFeedback] = useState<'success' | 'error' | null>(null);

  const key = 'docbuilder:jira-standalone:v1';
  const storedIdentity = useMemo(() => {
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
    void loadStatus();
  }, [loadStatus]);

  const isConnected = Boolean(status?.connected);

  return (
    <section className="cf-screen cf-jira-standalone-screen" aria-label="Jira">
      <header className="cf-header">
        <div>
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
          <h2>Jira · Произвольная задача</h2>
        </div>
        <div className="cf-connection">
          <span
            className={`cf-status-badge ${isConnected ? 'is-connected' : 'is-disconnected'}`}
            role="status"
            aria-label={checking ? 'Проверка подключения' : isConnected ? 'Jira подключена' : 'Jira не подключена'}
            title={checking ? 'Проверка подключения…' : isConnected ? 'Jira подключена' : 'Jira не подключена'}
          >
            <span className="cf-status-dot" aria-hidden="true" />
            <span className="cf-status-label">
              {checking ? 'Проверка…' : isConnected ? 'Jira' : 'Не подключено'}
            </span>
          </span>
          {status?.project && (
            <span className="cf-jira-project-name" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--wb-text-muted)' }}>
              {status.project.name} ({status.project.key})
            </span>
          )}
          {!isConnected && !checking && (
            <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer" className="cf-confluence-bridge-link">
              Открыть локальное подключение
            </a>
          )}
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

      {!checking && !isConnected && (
        <div className="cf-notice">
          <h3>Подключите Jira</h3>
          <p>Для создания задач запустите локальное приложение с подключением к Jira.</p>
          <p>
            <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer">
              Открыть локальное подключение
            </a>{' '}
            ·{' '}
            <a href="/docbuilder-confluence-local.zip" download>
              Скачать локальное приложение
            </a>
          </p>
        </div>
      )}

      {storedIdentity.error ? (
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
