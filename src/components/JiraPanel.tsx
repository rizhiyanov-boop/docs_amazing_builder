import { useEffect, useRef, useState } from 'react';
import { CONFLUENCE_BRIDGE_URL } from '../confluenceClient';
import { jiraClient, type JiraClient, type JiraEpics, type JiraMetadata, type JiraOperation, type JiraStatus } from '../jiraClient';
import { WBButton, WBInput } from './primitives/WorkbenchPrimitives';

export function JiraPanel({ methodId, methodName, confluenceUrl, onBusyChange, client = jiraClient }: {
  methodId: string; methodName: string; confluenceUrl?: string; onBusyChange: (busy: boolean) => void; client?: JiraClient;
}) {
  const [status, setStatus] = useState<JiraStatus>();
  const [metadata, setMetadata] = useState<JiraMetadata>();
  const [epics, setEpics] = useState<JiraEpics>({ items: [], nextStart: null });
  const [epic, setEpic] = useState(''); const [search, setSearch] = useState('');
  const [summary, setSummary] = useState(methodName); const [description, setDescription] = useState('');
  const [operation, setOperation] = useState<JiraOperation>();
  const [recovery, setRecovery] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const lock = useRef(false); const epoch = useRef({ value: 0 });
  const origin = status?.baseUrl ?? ''; const projectId = status?.project?.id;
  useEffect(() => {
    let alive = true; let polling = false;
    const refresh = async () => { if (polling) return; polling = true; try { const next = await client.status(); if (alive) setStatus(next); } catch { if (alive) setStatus(undefined); } finally { polling = false; } };
    void refresh(); const timer = window.setInterval(() => void refresh(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [client]);
  useEffect(() => {
    const generation = epoch.current; const current = ++generation.value;
    const refresh = async () => {
      // Reset in the asynchronous refresh callback, including disconnects.
      await Promise.resolve(); if (generation.value !== current) return;
      setMetadata(undefined); setOperation(undefined); setEpic(''); setEpics({ items: [], nextStart: null }); setError(''); setLoading(false);
      if (!status?.connected || !origin || !projectId) return;
      setLoading(true);
      try {
        const [meta, op, list] = await Promise.all([client.metadata({ baseUrl: origin, projectId }), client.operation({ baseUrl: origin, projectId }, methodId), client.epics({ baseUrl: origin, projectId })]);
        if (generation.value === current) { setMetadata(meta); setOperation(op); setEpics(list); }
      } catch (failure) { if (generation.value === current) setError(failure instanceof Error ? failure.message : 'Не удалось прочитать Jira.'); }
      finally { if (generation.value === current) setLoading(false); }
    };
    void refresh(); return () => { generation.value++; };
  }, [client, origin, projectId, status?.connected, methodId]);
  const scope = { baseUrl: origin, projectId: projectId ?? '' };
  const act = async (action: () => Promise<JiraOperation>) => {
    if (lock.current) return; lock.current = true; setBusy(true); onBusyChange(true); setError(''); const current = epoch.current.value;
    try { const result = await action(); if (epoch.current.value === current) setOperation(result); }
    catch (failure) {
      if (epoch.current.value === current) setError(failure instanceof Error ? failure.message : 'Ошибка Jira.');
      try { const result = await client.operation(scope, methodId); if (epoch.current.value === current) setOperation(result); } catch { if (epoch.current.value === current) setOperation({ state: 'unknown', issue: null, linkedUrl: null }); }
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  const loadEpics = async (start = 0) => {
    const current = epoch.current.value; setLoading(true); setError('');
    try { const result = await client.epics(scope, search.trim(), start); if (current === epoch.current.value) setEpics(old => ({ ...result, items: start ? [...old.items, ...result.items] : result.items })); }
    catch (failure) { if (current === epoch.current.value) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить эпики.'); }
    finally { if (current === epoch.current.value) setLoading(false); }
  };
  return <section aria-label="Jira" className="cf-jira-panel">
    <div className="cf-actions"><span className={`cf-status ${status?.connected ? 'cf-status-active' : ''}`} title={status?.connected ? 'Jira подключена' : 'Jira не подключена'} aria-label={status?.connected ? 'Jira подключена' : 'Jira не подключена'}>●</span>
      {status?.project && <a href={status.project.url} target="_blank" rel="noopener noreferrer">{status.project.name} · {status.project.key}</a>}
      <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer">{status?.connected ? 'Изменить подключение или проект' : 'Подключить Jira локально'}</a>
    </div>
    {!status?.connected && <p className="cf-notice">Подключите Jira в той же локальной форме, что и Confluence. Можно вставить ссылку на любую задачу: её проект сохранится автоматически. Нужна версия локального приложения 1.3.0 или новее. <a href="/docbuilder-confluence-local.zip" download>Скачать</a></p>}
    {error && <p role="alert" className="cf-notice cf-error">{error}</p>}
    {status?.connected && <>
      {loading && <p role="status">Чтение Jira…</p>}
      {operation?.state === 'success' && operation.issue ? <div className="cf-notice"><h3>User Story создана</h3><a href={operation.issue.url} target="_blank" rel="noopener noreferrer">{operation.issue.key}</a>
        {operation.message && <p>{operation.message}</p>}
        {operation.linkedUrl && <p>Документация: <a href={operation.linkedUrl} target="_blank" rel="noopener noreferrer">Confluence</a></p>}
        {confluenceUrl && operation.linkedUrl !== confluenceUrl && <p><WBButton disabled={busy} onClick={() => void act(() => client.link(scope, methodId, confluenceUrl))}>Добавить ссылку Confluence</WBButton></p>}
        {!confluenceUrl && <p className="cf-muted">После публикации страницы здесь можно добавить ссылку Confluence.</p>}
      </div> : operation?.state === 'unknown' ? <div className="cf-notice"><h3>Результат создания не подтверждён</h3><p>Проверьте Jira. Повторное создание заблокировано, чтобы избежать дублей.</p><label className="cf-field">Ссылка на созданную задачу<WBInput value={recovery} onChange={event => setRecovery(event.target.value)} /></label><p><WBButton disabled={busy || !recovery.trim()} onClick={() => void act(() => client.confirm(scope, methodId, recovery.trim()))}>Проверить и привязать задачу</WBButton></p></div> : <>
        {metadata?.message && <p role="alert" className="cf-notice">{metadata.message}</p>}
        <div className="cf-grid"><section><h3>Эпик</h3><label className="cf-field">Поиск эпика<WBInput value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void loadEpics(); } }} /></label>
          <p><WBButton disabled={busy || loading} onClick={() => void loadEpics()}>Найти</WBButton></p><label className="cf-field">Привязать к эпику<select disabled={busy} value={epic} onChange={event => setEpic(event.target.value)}><option value="">Выберите эпик</option>{epics.items.map(item => <option key={item.key} value={item.key}>{item.key} · {item.name}</option>)}</select></label>
          {epics.nextStart !== null && <p><WBButton disabled={busy || loading} onClick={() => void loadEpics(epics.nextStart ?? 0)}>Загрузить ещё</WBButton></p>}
        </section><section><h3>User Story</h3><label className="cf-field">Тема<WBInput maxLength={255} disabled={busy} value={summary} onChange={event => setSummary(event.target.value)} /></label><label className="cf-field">Описание<textarea className="cf-jira-description" rows={12} maxLength={100000} disabled={busy} value={description} onChange={event => setDescription(event.target.value)} /></label><p className="cf-muted">Пока текст задаётся вручную. Шаблон и генерацию через ИИ добавим после согласования.</p><p className="cf-muted">{confluenceUrl ? 'Ссылка на опубликованную страницу Confluence будет добавлена в задачу.' : 'Страница ещё не опубликована. Ссылку можно добавить после публикации.'}</p></section></div>
        <footer className="cf-footer"><WBButton variant="accent" disabled={busy || loading || !operation || !metadata?.story || Boolean(metadata?.requiredFields.length) || !status.remembered || !epic || !summary.trim() || !description.trim()} onClick={() => void act(() => client.create(scope, { methodId, summary: summary.trim(), description: description.trim(), epic, ...(confluenceUrl ? { confluenceUrl } : {}) }))}>{busy ? 'Создание…' : 'Создать User Story'}</WBButton></footer>
        {!status.remembered && <p className="cf-muted">Включите сохранение Jira в локальной форме для защиты от повторного создания задач.</p>}
      </>}
    </>}
  </section>;
}
