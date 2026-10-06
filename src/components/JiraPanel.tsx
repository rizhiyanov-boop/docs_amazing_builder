import { useEffect, useRef, useState } from 'react';
import { CONFLUENCE_BRIDGE_URL } from '../confluenceClient';
import { jiraClient, type JiraClient, type JiraEpics, type JiraIssueKind, type JiraMetadata, type JiraOperation, type JiraStatus } from '../jiraClient';
import { prepareJiraTaskWithAi } from '../openrouterClient';
import type { JiraDraft, JiraDraftInput } from '../jiraDraft';
import { JIRA_LABELS, JIRA_PRIORITY_RULES, jiraDescription } from '../jiraLabels';
import { WBButton, WBInput } from './primitives/WorkbenchPrimitives';

type Props = {
  methodId: string; methodName: string; methodContext?: string; confluenceUrl?: string; jiraTicket?: string;
  onBusyChange: (busy: boolean) => void; onLinked?: (methodId: string, issueUrl: string) => void;
  client?: JiraClient; prepareDraft?: (input: JiraDraftInput) => Promise<JiraDraft>;
};

export function JiraPanel({ methodId, methodName, methodContext = '', confluenceUrl, jiraTicket, onBusyChange, onLinked, client = jiraClient, prepareDraft = prepareJiraTaskWithAi }: Props) {
  const [status, setStatus] = useState<JiraStatus>();
  const [metadata, setMetadata] = useState<JiraMetadata>();
  const [issueKind, setIssueKind] = useState<JiraIssueKind>('task');
  const [epics, setEpics] = useState<JiraEpics>({ items: [], nextStart: null });
  const [epic, setEpic] = useState(''); const [search, setSearch] = useState('');
  const [epicQuery, setEpicQuery] = useState('');
  const [summary, setSummary] = useState(''); const [descriptionRu, setDescriptionRu] = useState(''); const [descriptionEn, setDescriptionEn] = useState('');
  const [labels, setLabels] = useState<string[]>([]); const [priorityId, setPriorityId] = useState('');
  const [draft, setDraft] = useState<JiraDraft>(); const [operation, setOperation] = useState<JiraOperation>();
  const [recovery, setRecovery] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [generating, setGenerating] = useState(false); const [loading, setLoading] = useState(false);
  const lock = useRef(false); const epoch = useRef({ value: 0 }); const linkedCallback = useRef(onLinked);
  const origin = status?.baseUrl ?? ''; const projectId = status?.project?.id;
  useEffect(() => { linkedCallback.current = onLinked; }, [onLinked]);
  useEffect(() => {
    let alive = true; let polling = false;
    const refresh = async () => { if (polling) return; polling = true; try { const next = await client.status(); if (alive) setStatus(next); } catch { if (alive) setStatus(undefined); } finally { polling = false; } };
    void refresh(); const timer = window.setInterval(() => void refresh(), 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [client]);
  useEffect(() => {
    const generation = epoch.current; const current = ++generation.value;
    const refresh = async () => {
      await Promise.resolve(); if (generation.value !== current) return;
      setMetadata(undefined); setOperation(undefined); setEpic(''); setEpics({ items: [], nextStart: null }); setDraft(undefined); setLabels([]); setPriorityId(''); setSearch(''); setEpicQuery(''); setError(''); setLoading(false);
      if (!status?.connected || !origin || !projectId) return;
      setLoading(true); const scope = { baseUrl: origin, projectId };
      try {
        // The bridge serializes reads: metadata and epic search must not overlap.
        const [meta, op] = await Promise.all([client.metadata(scope, issueKind), client.operation(scope, methodId)]);
        if (generation.value !== current) return;
        setMetadata(meta); setOperation(op); setPriorityId(meta.defaultPriorityId ?? '');
        if (op.state === 'success' && op.issue) linkedCallback.current?.(methodId, op.issue.url);
        if (op.state === 'none' && meta.story) {
          const list = await client.epics(scope);
          if (generation.value === current) setEpics(list);
        }
      } catch (failure) { if (generation.value === current) setError(failure instanceof Error ? failure.message : 'Не удалось прочитать Jira.'); }
      finally { if (generation.value === current) setLoading(false); }
    };
    void refresh(); return () => { generation.value++; };
  }, [client, origin, projectId, status?.connected, methodId, issueKind]);
  const scope = { baseUrl: origin, projectId: projectId ?? '' };
  const act = async (action: () => Promise<JiraOperation>) => {
    if (lock.current) return; lock.current = true; setBusy(true); onBusyChange(true); setError(''); const current = epoch.current.value;
    const accept = (result: JiraOperation) => {
      if (epoch.current.value !== current) return;
      setOperation(result); if (result.state === 'success' && result.issue) linkedCallback.current?.(methodId, result.issue.url);
    };
    try { accept(await action()); }
    catch (failure) {
      if (epoch.current.value === current) setError(failure instanceof Error ? failure.message : 'Ошибка Jira.');
      try { accept(await client.operation(scope, methodId)); } catch { if (epoch.current.value === current) setOperation({ state: 'unknown', issue: null, linkedUrl: null }); }
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  const loadEpics = async (start = 0) => {
    const current = epoch.current.value; setLoading(true); setError('');
    try {
      const query = start ? epicQuery : search.trim();
      const result = await client.epics(scope, query, start);
      if (current === epoch.current.value) { setEpics(old => ({ ...result, items: start ? [...old.items, ...result.items] : result.items })); if (!start) { setEpic(''); setDraft(undefined); setEpicQuery(query); } }
    } catch (failure) { if (current === epoch.current.value) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить эпики.'); }
    finally { if (current === epoch.current.value) setLoading(false); }
  };
  const prepare = async () => {
    if (lock.current || !status?.project || !metadata?.story || metadata.issueKind !== issueKind) return;
    lock.current = true; setGenerating(true); onBusyChange(true); setError(''); const current = epoch.current.value;
    try {
      // Rank the whole current project/search, not only the first 50 epics.
      let items = [...epics.items]; let next = epics.nextStart;
      while (next !== null) {
        if (items.length >= 500) throw new Error('Найдено больше 500 эпиков. Уточните поиск перед подготовкой.');
        const page = await client.epics(scope, epicQuery, next);
        if (current !== epoch.current.value) return;
        if (!page.items.length || page.nextStart !== null && page.nextStart <= next) throw new Error('Jira не предоставила следующую страницу эпиков.');
        items = [...items, ...page.items]; next = page.nextStart;
      }
      items = [...new Map(items.map(item => [item.key, item])).values()];
      if (items.length > 500) throw new Error('Найдено больше 500 эпиков. Уточните поиск перед подготовкой.');
      if (!items.length) throw new Error('В выбранном проекте не найдено эпиков. Измените поиск или создайте эпик в Jira.');
      if (current !== epoch.current.value) return;
      setEpics({ items, nextStart: null });
      const result = await prepareDraft({ method: { name: methodName, context: methodContext }, project: { key: status.project.key, name: status.project.name }, issueType: metadata.story.name, epics: items.map(({ key, name }) => ({ key, name })), priorities: metadata.priorities ?? [] });
      if (current !== epoch.current.value) return;
      setDraft(result); setSummary(result.summary); setDescriptionRu(result.descriptionRu); setDescriptionEn(result.descriptionEn);
      setLabels(metadata.labelsSupported ? result.labels.map(label => label.key) : []); setPriorityId(result.priorityId || metadata.defaultPriorityId || ''); setEpic('');
    } catch (failure) { if (current === epoch.current.value) setError(failure instanceof Error ? failure.message : 'Не удалось подготовить задачу.'); }
    finally { lock.current = false; setGenerating(false); onBusyChange(false); }
  };
  const recommended = (draft?.rankedEpics ?? []).flatMap(item => { const epic = epics.items.find(epic => epic.key === item.key); return epic ? [{ ...epic, reason: item.reason }] : []; });
  const others = epics.items.filter(item => !recommended.some(epic => epic.key === item.key));
  const priorities = metadata?.priorities ?? [];
  const selectedPriority = priorities.find(priority => priority.id === priorityId);
  const knownPriority = selectedPriority && ['critical', 'highest', 'high', 'medium', 'low'].includes(selectedPriority.name.toLowerCase());
  const conflicts = labels.filter(label => JIRA_PRIORITY_RULES[label] && knownPriority && !JIRA_PRIORITY_RULES[label].some(name => name.toLowerCase() === selectedPriority.name.toLowerCase()));
  const disabled = busy || generating || loading;
  const ready = operation?.state === 'none' && metadata?.issueKind === issueKind && metadata.story && !metadata.requiredFields.length;
  const canCreate = ready && status?.remembered && epic && summary.trim() && descriptionRu.trim() && descriptionEn.trim() && (!metadata.labelsRequired || labels.length) && (!metadata.priorityRequired || priorityId);
  const toggleLabel = (key: string) => setLabels(old => old.includes(key) ? old.filter(label => label !== key) : [...old, key]);
  return <section aria-label="Jira" className="cf-jira-panel">
    <div className="cf-actions"><span className={`cf-status ${status?.connected ? 'cf-status-active' : ''}`} title={status?.connected ? 'Jira подключена' : 'Jira не подключена'} aria-label={status?.connected ? 'Jira подключена' : 'Jira не подключена'}>●</span>
      {status?.project && <a href={status.project.url} target="_blank" rel="noopener noreferrer">{status.project.name} · {status.project.key}</a>}
      <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer">{status?.connected ? 'Изменить подключение или проект' : 'Подключить Jira локально'}</a>
    </div>
    {!status?.connected && <p className="cf-notice">Подключите Jira в той же локальной форме, что и Confluence. Ссылка на любую задачу определит проект. Нужна версия локального приложения 1.3.1 или новее. <a href="/docbuilder-confluence-local.zip" download>Скачать</a></p>}
    {error && <p role="alert" className="cf-notice cf-error">{error}</p>}
    {status?.connected && <>
      {loading && <p role="status">Чтение Jira…</p>}
      {operation?.state === 'none' && jiraTicket?.trim() ? <div className="cf-notice"><h3>Метод уже связан с задачей Jira</h3><p>{jiraTicket}</p><p>Ссылка включена в Wiki-разметку и будет добавлена в Confluence при публикации. Повторная задача для этого метода не создаётся.</p></div> : operation?.state === 'success' && operation.issue ? <div className="cf-notice"><h3>Задача создана</h3><a href={operation.issue.url} target="_blank" rel="noopener noreferrer">{operation.issue.key}</a>
        {operation.message && <p>{operation.message}</p>}
        {operation.linkedUrl && <p>Документация: <a href={operation.linkedUrl} target="_blank" rel="noopener noreferrer">Confluence</a></p>}
        {confluenceUrl && operation.linkedUrl !== confluenceUrl && <p><WBButton disabled={disabled} onClick={() => void act(() => client.link(scope, methodId, confluenceUrl))}>Добавить ссылку Confluence</WBButton></p>}
        <p>Ссылка на задачу сохранена в поле Jira метода и включена в Wiki-разметку. В Confluence она появится при следующей публикации страницы.</p>
        {!confluenceUrl && <p className="cf-muted">После публикации страницы здесь можно добавить ссылку Confluence в задачу.</p>}
      </div> : operation?.state === 'unknown' ? <div className="cf-notice"><h3>Результат создания не подтверждён</h3><p>Проверьте Jira. Повторное создание заблокировано, чтобы избежать дублей.</p><WBInput label="Ссылка на созданную задачу" value={recovery} onChange={event => setRecovery(event.target.value)} /><p><WBButton disabled={disabled || !recovery.trim()} onClick={() => void act(() => client.confirm(scope, methodId, recovery.trim()))}>Проверить и привязать задачу</WBButton></p></div> : <>
        {metadata?.message && <p role="alert" className="cf-notice">{metadata.message}</p>}
        {metadata && metadata.issueKind !== issueKind && <p role="alert" className="cf-notice cf-error">Обновите локальный сервис до версии 1.3.1. Он должен подтверждать выбранный тип задачи.</p>}
        <div className="cf-jira-toolbar"><label className="cf-field">Тип задачи<select value={issueKind} disabled={disabled} onChange={event => setIssueKind(event.target.value as JiraIssueKind)}><option value="task">Задача · тестирование</option><option value="story">User Story</option></select></label><WBButton disabled={disabled || !ready || !epics.items.length} onClick={() => void prepare()}>{generating ? 'Подготовка через ИИ…' : draft ? 'Подготовить заново' : 'Подготовить через ИИ'}</WBButton></div>
        <p className="cf-muted">{methodName} · одна задача на метод. Проверьте эпик, теги и текст перед созданием.</p>
        {!loading && ready && !epics.items.length && <p className="cf-notice">{epicQuery ? 'По этому запросу эпики не найдены. Измените поиск.' : 'В выбранном проекте нет доступных эпиков. Создайте эпик в Jira или выберите другой проект в локальном подключении, затем обновите поиск.'}</p>}
        <div className="cf-grid"><section><h3>Назначение задачи</h3>
          <div className="cf-jira-search"><WBInput label="Поиск эпика в выбранном проекте" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!disabled) void loadEpics(); } }} /><WBButton disabled={disabled} onClick={() => void loadEpics()}>Найти</WBButton></div>
          <label className="cf-field">Привязать к эпику<select disabled={disabled} value={epic} onChange={event => setEpic(event.target.value)}><option value="">Выберите эпик</option>{recommended.length > 0 && <optgroup label="Рекомендует ИИ · по соответствию, сверху вниз">{recommended.map((item, index) => <option key={item.key} value={item.key}>{index + 1}. {item.key} · {item.name}</option>)}</optgroup>}<optgroup label={recommended.length ? 'Другие эпики проекта' : 'Эпики выбранного проекта'}>{others.map(item => <option key={item.key} value={item.key}>{item.key} · {item.name}</option>)}</optgroup></select></label>
          {epic && <p className="cf-muted">{recommended.find(item => item.key === epic)?.reason} <a href={`${origin}/browse/${epic}`} target="_blank" rel="noopener noreferrer">Открыть эпик</a></p>}
          {draft && !recommended.length && <p className="cf-muted">ИИ не нашёл подходящего эпика. Выберите его вручную.</p>}
          {epics.nextStart !== null && <p><WBButton disabled={disabled} onClick={() => void loadEpics(epics.nextStart ?? 0)}>Загрузить ещё</WBButton><span className="cf-muted"> При подготовке ИИ прочитает остальные эпики.</span></p>}
          {metadata?.labelsSupported && <div className="cf-jira-labels"><span className="cf-muted">Рекомендованные теги</span><div className="cf-actions">{draft?.labels.map(label => <WBButton key={label.key} size="sm" aria-pressed={labels.includes(label.key)} title={label.reason} onClick={() => toggleLabel(label.key)} disabled={disabled}>{labels.includes(label.key) ? '✓ ' : '+ '}{label.key}</WBButton>)}{!draft?.labels.length && <span className="cf-muted">Можно выбрать вручную</span>}</div>
            {labels.filter(label => !draft?.labels.some(item => item.key === label)).length > 0 && <p>{labels.filter(label => !draft?.labels.some(item => item.key === label)).join(', ')}</p>}
            <details><summary>Все теги · {JIRA_LABELS.length}</summary><div className="cf-jira-tag-list">{JIRA_LABELS.map(label => <label key={label.key} className="cf-jira-tag"><input type="checkbox" disabled={disabled} checked={labels.includes(label.key)} onChange={() => toggleLabel(label.key)} /><span>{label.key}<span className="cf-muted">{label.description} · {label.role}</span></span></label>)}</div></details>
          </div>}
          {priorities.length > 0 && <><label className="cf-field">Приоритет<select disabled={disabled} value={priorityId} onChange={event => setPriorityId(event.target.value)}><option value="">{metadata?.priorityRequired ? 'Выберите приоритет' : 'По умолчанию в Jira'}</option>{priorities.map(priority => <option key={priority.id} value={priority.id}>{priority.name}</option>)}</select></label>{draft?.priorityReason && <p className="cf-muted">{draft.priorityReason}</p>}{labels.filter(label => JIRA_PRIORITY_RULES[label]).map(label => <p key={label} className="cf-muted">{label}: {JIRA_PRIORITY_RULES[label].join(', ')}</p>)}{conflicts.length > 0 && <p className="cf-error" role="alert">Выбранный приоритет выходит за рекомендованный диапазон: {conflicts.join(', ')}.</p>}</>}
        </section><section><h3>Текст задачи</h3><WBInput label="Название · английский, глагол действия" maxLength={255} disabled={disabled} value={summary} onChange={event => setSummary(event.target.value)} />
          <label className="cf-field">Описание · русский<textarea className="cf-jira-description" rows={6} maxLength={5000} disabled={disabled} value={descriptionRu} onChange={event => setDescriptionRu(event.target.value)} /></label><label className="cf-field">Описание · английский перевод<textarea className="cf-jira-description" rows={6} maxLength={5000} disabled={disabled} value={descriptionEn} onChange={event => setDescriptionEn(event.target.value)} /></label><p className="cf-muted">Кратко: что делаем, как делаем и для чего. Английская версия должна передавать тот же смысл.</p><p className="cf-muted">{confluenceUrl ? 'Ссылка на опубликованную страницу Confluence будет добавлена в задачу.' : 'Страница ещё не опубликована. Ссылку можно добавить после публикации.'}</p>
        </section></div>
        <footer className="cf-footer"><span className="cf-muted">{!epic ? 'Выберите эпик для создания задачи' : 'Создание после вашего подтверждения'}</span><WBButton variant="accent" disabled={disabled || !canCreate} onClick={() => void act(() => client.create(scope, { methodId, issueKind, summary: summary.trim(), description: jiraDescription(descriptionRu, descriptionEn), epic, labels, ...(priorityId ? { priorityId } : {}), ...(confluenceUrl ? { confluenceUrl } : {}) }))}>{busy ? 'Создание…' : issueKind === 'task' ? 'Создать задачу' : 'Создать User Story'}</WBButton></footer>
        {!status.remembered && <p className="cf-muted">Включите сохранение Jira в локальной форме для защиты от повторного создания задач.</p>}
      </>}
    </>}
  </section>;
}
