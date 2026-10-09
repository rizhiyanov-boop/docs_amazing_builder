import { useMemo, useState } from 'react';
import { JiraPanel } from './JiraPanel';
import type { JiraClient } from '../jiraClient';
import type { JiraDraft, JiraDraftInput } from '../jiraDraft';
import { WBButton } from './primitives/WorkbenchPrimitives';
import { CONFLUENCE_BRIDGE_URL } from '../confluenceClient';

type Props = {
  methodId: string; methodName: string; methodContext: string; jiraTicket?: string; confluenceUrl?: string; active: boolean;
  onBusyChange: (busy: boolean) => void; onLinked?: (methodId: string, issueUrl: string) => void;
  client?: JiraClient; prepareDraft?: (input: JiraDraftInput) => Promise<JiraDraft>;
};

type Scenario = 'method' | 'freeform' | 'new-method';
function taskIdentity(key: string, renew = false) {
    try {
      const saved = localStorage.getItem(key);
      if (!renew && saved && /^task-[a-f0-9-]{36}$/.test(saved)) return { id: saved, error: '' };
      const id = `task-${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
      return { id, error: '' };
    } catch { return { id: '', error: 'Не удалось сохранить идентификатор отдельной задачи. Разрешите локальное хранение перед созданием.' }; }
}
/** Each new task keeps a durable identity through retries and reloads. */
export function JiraTaskWorkflow(props: Props) {
  const [source, setSource] = useState<Scenario>('method');
  const [busy, setBusy] = useState(false);
  const [completedIdentity, setCompletedIdentity] = useState('');
  const [connectionScope, setConnectionScope] = useState('');
  const [latestIdentity, setLatestIdentity] = useState<{ key: string; value: ReturnType<typeof taskIdentity> }>();
  const key = source === 'freeform' ? `docbuilder:jira-standalone:v1:${connectionScope}` : `docbuilder:jira-new-method:v1:${connectionScope}:${encodeURIComponent(props.methodId)}`;
  const storedIdentity = useMemo(() => connectionScope ? taskIdentity(key) : { id: '', error: '' }, [connectionScope, key]);
  const identity = latestIdentity?.key === key ? latestIdentity.value : storedIdentity;
  const currentIdentity = `${key}:${identity.id}`;
  const completed = completedIdentity === currentIdentity;
  const setCompleted = (value: boolean) => setCompletedIdentity(value ? currentIdentity : '');
  const select = (next: Scenario) => { setCompletedIdentity(''); setSource(next); };
  const startNext = () => {
    if (busy || !completed) return;
    setLatestIdentity({ key, value: taskIdentity(key, true) });
    setCompletedIdentity('');
  };
  const onBusyChange = (value: boolean) => { setBusy(value); props.onBusyChange(value); };
  return <>
    <div className="cf-actions" role="group" aria-label="Сценарий Jira">
      <WBButton variant={source === 'method' ? 'accent' : 'secondary'} disabled={busy} aria-pressed={source === 'method'} onClick={() => select('method')}>{props.jiraTicket ? 'Обновить связанную задачу' : 'Создать по текущему методу'}</WBButton>
      <WBButton variant={source === 'freeform' ? 'accent' : 'secondary'} disabled={busy} aria-pressed={source === 'freeform'} onClick={() => select('freeform')}>Свободное описание</WBButton>
      <WBButton variant={source === 'new-method' ? 'accent' : 'secondary'} disabled={busy} aria-pressed={source === 'new-method'} onClick={() => select('new-method')}>Новая задача по методу</WBButton>
    </div>
    <div hidden={source !== 'method'}><JiraPanel {...props} active={props.active && source === 'method'} onBusyChange={onBusyChange} onConnectionScopeChange={setConnectionScope} /></div>
    {source !== 'method' && !connectionScope && <p className="cf-notice">Подключите Jira, чтобы подготовить задачу. <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer">Подключить Jira локально</a> · <a href="/docbuilder-confluence-local.zip" download>Скачать локальное приложение 1.3.5</a></p>}
    {source !== 'method' && connectionScope && <>
      {source === 'new-method' && <p className="cf-notice">Создаётся отдельная задача по текущему методу. Существующая связь метода с Jira сохраняется.</p>}
      {identity.error ? <p role="alert" className="cf-notice cf-error">{identity.error}</p> : <JiraPanel key={`${source}:${identity.id}`} methodId={identity.id} methodName={source === 'freeform' ? 'Отдельная задача' : props.methodName} methodContext={source === 'freeform' ? '' : props.methodContext} confluenceUrl={source === 'freeform' ? undefined : props.confluenceUrl} source={source === 'freeform' ? 'freeform' : 'method'} active={props.active} onBusyChange={onBusyChange} onCompletedChange={setCompleted} client={props.client} prepareDraft={props.prepareDraft} />}
      <WBButton disabled={busy || !completed} onClick={startNext}>Начать следующую задачу</WBButton>
    </>}
  </>;
}
