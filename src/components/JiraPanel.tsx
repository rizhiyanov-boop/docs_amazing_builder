import { useEffect, useRef, useState } from 'react';
import { CONFLUENCE_BRIDGE_URL } from '../confluenceClient';
import { jiraClient, type JiraClient, type JiraEpics, type JiraIssue, type JiraIssueResult, type JiraIssueKind, type JiraMetadata, type JiraOperation, type JiraStatus } from '../jiraClient';
import { prepareJiraTaskWithAi } from '../openrouterClient';
import type { JiraDraft, JiraDraftInput } from '../jiraDraft';
import { JIRA_LABELS, JIRA_PRIORITY_RULES, jiraDescription } from '../jiraLabels';
import { jiraFormCacheKey, readJiraFormCache, writeJiraFormCache, type JiraFormCache } from '../jiraFormCache';
import { WBButton, WBInput } from './primitives/WorkbenchPrimitives';
import { AiRequestProgress } from './AiRequestProgress';

type Props = {
  methodId: string; methodName: string; methodContext?: string; confluenceUrl?: string; jiraTicket?: string; active?: boolean;
  onBusyChange: (busy: boolean) => void; onLinked?: (methodId: string, issueUrl: string) => void;
  client?: JiraClient; prepareDraft?: (input: JiraDraftInput) => Promise<JiraDraft>;
};

const tagGroups = [
  { title: 'Основные', role: 'Основной' },
  { title: 'Дополнительные', role: 'Дополнительный' },
  { title: 'Основные / дополнительные', role: 'Основной / дополнительный' }
] as const;

export function JiraPanel({ methodId, methodName, methodContext = '', confluenceUrl, jiraTicket, active = true, onBusyChange, onLinked, client = jiraClient, prepareDraft = prepareJiraTaskWithAi }: Props) {
  const [status, setStatus] = useState<JiraStatus>();
  const [metadata, setMetadata] = useState<JiraMetadata>();
  const [issueKind, setIssueKind] = useState<JiraIssueKind>('task');
  const [epics, setEpics] = useState<JiraEpics>({ items: [], nextStart: null });
  const [epic, setEpic] = useState(''); const [search, setSearch] = useState('');
  const [epicQuery, setEpicQuery] = useState('');
  const [summary, setSummary] = useState(''); const [descriptionRu, setDescriptionRu] = useState(''); const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionUz, setDescriptionUz] = useState('');
  const [description, setDescription] = useState(''); const [issue, setIssue] = useState<JiraIssue>();
  const [fingerprint, setFingerprint] = useState(''); const [localConflict, setLocalConflict] = useState(false);
  const [cacheKey, setCacheKey] = useState(''); const [cacheWarning, setCacheWarning] = useState(false);
  const [labels, setLabels] = useState<string[]>([]); const [priorityId, setPriorityId] = useState('');
  const [draft, setDraft] = useState<JiraDraft>(); const [operation, setOperation] = useState<JiraOperation>();
  const [recovery, setRecovery] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [generating, setGenerating] = useState(false); const [loading, setLoading] = useState(false);
  const [preparationPhase, setPreparationPhase] = useState<'epics' | 'ai'>('epics');
  const lock = useRef(false); const epoch = useRef({ value: 0 }); const linkedCallback = useRef(onLinked);
  const origin = status?.baseUrl ?? ''; const projectId = status?.project?.id;
  const bindingRef = useRef(jiraTicket);
  useEffect(() => { bindingRef.current = jiraTicket; }, [jiraTicket]);
  const changed = Boolean(issue && (summary.trim() !== issue.summary || description !== issue.description || epic !== issue.epic || priorityId !== issue.priorityId || JSON.stringify([...labels].sort()) !== JSON.stringify([...issue.labels].sort())));
  const form = { issueKind, summary, descriptionRu, descriptionEn, descriptionUz, description, epic, labels, priorityId, search, epicQuery, draft, ...(issue ? { issueKey: issue.key, fingerprint, dirty: changed } : {}) };
  useEffect(() => {
    const saved = !cacheKey || writeJiraFormCache(cacheKey, form); let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) setCacheWarning(!saved); });
    return () => { cancelled = true; };
  // Only form values belong to the local draft; connection status polling must not reset it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, issueKind, summary, descriptionRu, descriptionEn, descriptionUz, description, epic, labels, priorityId, search, epicQuery, draft, issue?.key, fingerprint, changed]);
  const applyForm = (value: JiraFormCache) => {
    setSummary(value.summary); setDescriptionRu(value.descriptionRu); setDescriptionEn(value.descriptionEn); setDescriptionUz(value.descriptionUz); setDescription(value.description);
    setEpic(value.epic); setLabels(value.labels); setPriorityId(value.priorityId); setSearch(value.search); setEpicQuery(value.epicQuery); setDraft(value.draft); setFingerprint(value.fingerprint ?? '');
  };
  const acceptIssue = (result: JiraIssueResult, cached?: JiraFormCache) => {
    setIssue(result.issue); setMetadata(result.metadata); setOperation(result.operation);
    linkedCallback.current?.(methodId, result.issue.url);
    const matching = cached?.issueKey === result.issue.key;
    const dirty = matching && cached.dirty && (cached.summary !== result.issue.summary || cached.description !== result.issue.description || cached.epic !== result.issue.epic || cached.priorityId !== result.issue.priorityId || JSON.stringify([...cached.labels].sort()) !== JSON.stringify([...result.issue.labels].sort()));
    if (matching && dirty) { applyForm(cached); setLocalConflict(cached.fingerprint !== result.issue.fingerprint); }
    else {
      applyForm({ issueKind: result.metadata.issueKind ?? 'task', summary: result.issue.summary, description: result.issue.description, descriptionRu: '', descriptionEn: '', descriptionUz: '', epic: result.issue.epic, labels: result.issue.labels, priorityId: result.issue.priorityId, search: '', epicQuery: '', issueKey: result.issue.key, fingerprint: result.issue.fingerprint });
      setLocalConflict(false);
    }
    return Boolean(matching && dirty);
  };
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
      if (!active) return;
      setCacheKey(''); setMetadata(undefined); setOperation(undefined); setIssue(undefined); setLocalConflict(false); setEpics({ items: [], nextStart: null }); setError(''); setLoading(false);
      if (!status?.connected || !origin || !projectId) return;
      setLoading(true); const scope = { baseUrl: origin, projectId };
      const key = jiraFormCacheKey(scope, methodId); const cached = readJiraFormCache(key);
      try {
        // The bridge serializes reads: metadata and epic search must not overlap.
        const op = await client.operation(scope, methodId);
        if (generation.value !== current) return;
        setOperation(op);
        let meta: JiraMetadata; let query = '';
        if (op.state === 'success' && op.issue || op.state === 'none' && bindingRef.current?.trim()) {
          const loaded = await client.issue(scope, methodId, bindingRef.current);
          if (generation.value !== current) return;
          const restored = acceptIssue(loaded, cached); meta = loaded.metadata; query = restored ? cached?.epicQuery ?? '' : '';
        } else {
          if (cached && cached.issueKind !== issueKind) { setIssueKind(cached.issueKind); return; }
          meta = await client.metadata(scope, issueKind);
          if (generation.value !== current) return;
          setMetadata(meta);
          applyForm(cached && !cached.issueKey ? cached : { issueKind, summary: '', descriptionRu: '', descriptionEn: '', descriptionUz: '', description: '', epic: '', labels: [], priorityId: meta.defaultPriorityId ?? '', search: '', epicQuery: '' });
          query = cached && !cached.issueKey ? cached.epicQuery : '';
        }
        setCacheKey(key);
        if (meta.story && meta.epicField && op.state !== 'unknown') {
          const list = await client.epics(scope, query);
          if (generation.value === current) setEpics(list);
        }
      } catch (failure) { if (generation.value === current) setError(failure instanceof Error ? failure.message : 'Не удалось прочитать Jira.'); }
      finally { if (generation.value === current) setLoading(false); }
    };
    void refresh(); return () => { generation.value++; };
  // Loading is scoped to the method/connection; callbacks read the current binding without refetching after onLinked.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, origin, projectId, status?.connected, methodId, issueKind, active]);
  const scope = { baseUrl: origin, projectId: projectId ?? '' };
  const readCurrent = async (keepLocal = true, acceptUnknown = false) => {
    if (lock.current) return; lock.current = true; setLoading(true); setError(''); const current = epoch.current.value;
    try {
      const loaded = acceptUnknown && issue ? await client.acceptCurrent(scope, methodId, issue.url, issue.fingerprint) : await client.issue(scope, methodId, bindingRef.current);
      if (current === epoch.current.value) acceptIssue(loaded, keepLocal ? readJiraFormCache(cacheKey) : undefined);
    } catch (failure) { if (current === epoch.current.value) setError(failure instanceof Error ? failure.message : 'Не удалось прочитать задачу.'); }
    finally { lock.current = false; if (current === epoch.current.value) setLoading(false); }
  };
  const act = async (action: () => Promise<JiraOperation>) => {
    if (lock.current) return; lock.current = true; setBusy(true); onBusyChange(true); setError(''); const current = epoch.current.value;
    const accept = (result: JiraOperation) => {
      if (epoch.current.value !== current) return;
      setOperation(result); if (result.state === 'success' && result.issue) linkedCallback.current?.(methodId, result.issue.url);
    };
    try {
      const result = await action(); accept(result);
      if (result.state === 'success' && result.issue && current === epoch.current.value) {
        const loaded = await client.issue(scope, methodId, result.issue.url);
        if (current === epoch.current.value) acceptIssue(loaded, issue ? readJiraFormCache(cacheKey) : undefined);
      }
    }
    catch (failure) {
      if (epoch.current.value === current) setError(failure instanceof Error ? failure.message : 'Ошибка Jira.');
      try { accept(await client.operation(scope, methodId)); } catch { if (epoch.current.value === current) setOperation({ state: 'unknown', issue: null, linkedUrl: null }); }
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  const update = async () => {
    if (lock.current || !issue) return; lock.current = true; setBusy(true); onBusyChange(true); setError(''); const current = epoch.current.value;
    try {
      const loaded = await client.update(scope, { methodId, link: issue.url, fingerprint, summary: summary.trim(), description, epic, labels, priorityId, ...(confluenceUrl ? { confluenceUrl } : {}) });
      if (current === epoch.current.value) acceptIssue(loaded);
    } catch (failure) {
      if (current === epoch.current.value) setError(failure instanceof Error ? failure.message : 'Не удалось обновить задачу.');
      try { const loaded = await client.issue(scope, methodId, issue.url); if (current === epoch.current.value) acceptIssue(loaded, readJiraFormCache(cacheKey)); }
      catch { try { const op = await client.operation(scope, methodId); if (current === epoch.current.value) setOperation(op); } catch { if (current === epoch.current.value) setOperation(old => old ? { ...old, updateState: 'unknown' } : old); } }
    } finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  const loadEpics = async (start = 0) => {
    const current = epoch.current.value; setLoading(true); setError('');
    try {
      const query = start ? epicQuery : search.trim();
      const result = await client.epics(scope, query, start);
      if (current === epoch.current.value) { setEpics(old => ({ ...result, items: start ? [...old.items, ...result.items] : result.items })); if (!start) { setDraft(undefined); setEpicQuery(query); } }
    } catch (failure) { if (current === epoch.current.value) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить эпики.'); }
    finally { if (current === epoch.current.value) setLoading(false); }
  };
  const prepare = async () => {
    if (lock.current || !status?.project || !metadata?.story || !issue && metadata.issueKind !== issueKind) return;
    lock.current = true; setPreparationPhase('epics'); setGenerating(true); onBusyChange(true); setError(''); const current = epoch.current.value;
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
      if (current !== epoch.current.value) return;
      setEpics({ items, nextStart: null });
      setPreparationPhase('ai');
      const result = await prepareDraft({ method: { name: methodName, context: methodContext }, project: { key: status.project.key, name: status.project.name }, issueType: metadata.story.name, epics: items.map(({ key, name }) => ({ key, name })), priorities: metadata.priorities ?? [] });
      if (current !== epoch.current.value) return;
      setDraft(result); setSummary(result.summary); setDescriptionRu(result.descriptionRu); setDescriptionEn(result.descriptionEn);
      setDescriptionUz(result.descriptionUz);
      if (issue) setDescription(jiraDescription(result.descriptionRu, result.descriptionEn, result.descriptionUz));
      setLabels(metadata.labelsSupported ? [...labels.filter(label => !JIRA_LABELS.some(item => item.key === label)), ...result.labels.map(label => label.key)] : labels); setPriorityId(result.priorityId || (issue ? priorityId : metadata.defaultPriorityId) || ''); if (!issue) setEpic('');
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
  const hasPrimaryLabel = labels.some(key => JIRA_LABELS.some(label => label.key === key && label.role !== 'Дополнительный'));
  const editing = Boolean(issue); const updateUnknown = operation?.updateState === 'unknown';
  const ready = (editing ? Boolean(metadata?.issueKind) : operation?.state === 'none' && !jiraTicket?.trim() && metadata?.issueKind === issueKind) && typeof metadata?.epicRequired === 'boolean' && metadata.story && !metadata.requiredFields.length;
  const canCreate = ready && status?.remembered && metadata.labelsSupported && hasPrimaryLabel && (!metadata.epicRequired || epic) && summary.trim() && descriptionRu.trim() && descriptionEn.trim() && descriptionUz.trim() && (!metadata.priorityRequired || priorityId);
  const canUpdate = ready && status?.remembered && changed && !localConflict && !updateUnknown && (!metadata.labelsSupported || hasPrimaryLabel) && (!metadata.epicRequired || epic) && summary.trim() && description.trim() && (!metadata.priorityRequired || priorityId);
  const toggleLabel = (key: string) => setLabels(old => old.includes(key) ? old.filter(label => label !== key) : [...old, key]);
  return <section aria-label="Jira" className="cf-jira-panel">
    <div className="cf-actions"><span className={`cf-status ${status?.connected ? 'cf-status-active' : ''}`} title={status?.connected ? 'Jira подключена' : 'Jira не подключена'} aria-label={status?.connected ? 'Jira подключена' : 'Jira не подключена'}>●</span>
      {status?.project && <a href={status.project.url} target="_blank" rel="noopener noreferrer">{status.project.name} · {status.project.key}</a>}
      <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer">{status?.connected ? 'Изменить подключение или проект' : 'Подключить Jira локально'}</a>
    </div>
    {!status?.connected && <p className="cf-notice">Подключите Jira в той же локальной форме, что и Confluence. Ссылка на любую задачу определит проект. Нужна версия локального приложения 1.3.4 или новее. <a href="/docbuilder-confluence-local.zip" download>Скачать</a></p>}
    {error && <p role="alert" className="cf-notice cf-error">{error}</p>}
    {cacheWarning && <p role="alert" className="cf-notice">Браузер не смог сохранить черновик локально. Не закрывайте форму до сохранения в Jira.</p>}
    {generating && <div className="cf-notice"><AiRequestProgress message={preparationPhase === 'epics' ? 'Подготовка ИИ: загружаем эпики проекта…' : 'ИИ: готовим название, описание и рекомендации…'} /></div>}
    {status?.connected && <>
      {loading && <p role="status">Чтение Jira…</p>}
      {(operation?.state === 'none' && jiraTicket?.trim() || operation?.state === 'success') && <div className="cf-notice"><h3>Метод уже связан с задачей Jira</h3>{operation?.issue ? <a href={operation.issue.url} target="_blank" rel="noopener noreferrer">{operation.issue.key}</a> : <p>{jiraTicket}</p>}
        {operation?.message && <p>{operation.message}</p>}
        {operation?.linkedUrl && <p>Документация: <a href={operation.linkedUrl} target="_blank" rel="noopener noreferrer">Confluence</a></p>}
        {confluenceUrl && operation?.issue && operation.linkedUrl !== confluenceUrl && <p><WBButton disabled={disabled} onClick={() => void act(() => client.link(scope, methodId, confluenceUrl))}>Добавить ссылку Confluence</WBButton></p>}
        <p>Ссылка на задачу сохранена в поле Jira метода и включена в Wiki-разметку. В Confluence она появится при следующей публикации страницы.</p>
        {!confluenceUrl && <p className="cf-muted">После публикации страницы здесь можно добавить ссылку Confluence в задачу.</p>}
        <WBButton disabled={disabled} onClick={() => void readCurrent()}>Загрузить из Jira</WBButton>
      </div>}
      {localConflict && <div className="cf-notice" role="alert"><p>Задача изменилась в Jira. Местные правки сохранены; обновление заблокировано до выбора версии.</p><details><summary>Текущая версия Jira</summary><p>{issue?.summary}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{issue?.description}</pre><p>Эпик: {issue?.epic || 'Без эпика'} · Теги: {issue?.labels.join(', ')} · Приоритет: {issue?.priorityId || 'Не задан'}</p></details><div className="cf-actions"><WBButton disabled={disabled} onClick={() => void readCurrent(false)}>Использовать версию Jira</WBButton><WBButton disabled={disabled || updateUnknown} onClick={() => { setFingerprint(issue?.fingerprint ?? ''); setLocalConflict(false); }}>Оставить мои правки</WBButton></div></div>}
      {updateUnknown && <div className="cf-notice" role="alert"><h3>Результат обновления не подтверждён</h3><p>Повторное обновление заблокировано. Черновик сохранён локально.</p><div className="cf-actions"><WBButton disabled={disabled} onClick={() => void readCurrent()}>Проверить обновление</WBButton><WBButton disabled={disabled} onClick={() => void readCurrent(false, true)}>Принять текущую версию Jira</WBButton></div></div>}
      {operation?.state === 'unknown' ? <div className="cf-notice"><h3>Результат создания не подтверждён</h3><p>Проверьте Jira. Повторное создание заблокировано, чтобы избежать дублей.</p><WBInput label="Ссылка на созданную задачу" value={recovery} onChange={event => setRecovery(event.target.value)} /><p><WBButton disabled={disabled || !recovery.trim()} onClick={() => void act(() => client.confirm(scope, methodId, recovery.trim()))}>Проверить и привязать задачу</WBButton></p></div> : (editing || operation?.state === 'none' && !jiraTicket?.trim()) && <>
        {metadata?.message && <p role="alert" className="cf-notice">{metadata.message}</p>}
        {!editing && metadata?.story && metadata.labelsSupported === false && <p role="alert" className="cf-notice cf-error">В Jira недоступно поле тегов для выбранного типа задачи. Добавьте его на экран создания в Jira: основной тег обязателен.</p>}
        {!editing && metadata && (metadata.issueKind !== issueKind || typeof metadata.epicRequired !== 'boolean') && <p role="alert" className="cf-notice cf-error">Обновите локальный сервис до версии 1.3.4. <a href="/docbuilder-confluence-local.zip" download>Скачать</a></p>}
        <div className="cf-jira-toolbar">{editing ? <span className="cf-muted">Тип задачи: {issue?.issueType.name}</span> : <label className="cf-field">Тип задачи<select value={issueKind} disabled={disabled} onChange={event => { const next = event.target.value as JiraIssueKind; if (cacheKey) writeJiraFormCache(cacheKey, { ...form, issueKind: next }); setIssueKind(next); }}><option value="task">Задача · тестирование</option><option value="story">User Story</option></select></label>}<WBButton disabled={disabled || !ready || updateUnknown || localConflict || editing && (!metadata?.editableFields?.includes('summary') || !metadata?.editableFields?.includes('description'))} onClick={() => void prepare()}>{generating ? 'Подготовка через ИИ…' : draft ? 'Подготовить заново' : 'Подготовить через ИИ'}</WBButton></div>
        <p className="cf-muted">{methodName} · одна задача на метод. {editing ? 'Изменения сохраняются в связанную задачу по кнопке «Обновить задачу».' : 'Проверьте эпик, теги и текст перед созданием.'} Черновик сохраняется только в этом браузере.</p>
        {metadata?.epicRequired && <p className="cf-notice">В выбранном проекте Jira эпик обязателен. Выберите его вручную, если рекомендации не подходят.</p>}
        {!loading && ready && !epics.items.length && <p className="cf-notice">{epicQuery ? 'По этому запросу эпики не найдены. Можно изменить поиск.' : 'В выбранном проекте нет доступных эпиков.'}{!metadata.epicRequired && ' Текст, теги и приоритет можно подготовить, а задачу — создать без эпика.'}</p>}
        <div className="cf-grid"><section><h3>Назначение задачи</h3>
          <div className="cf-jira-search"><WBInput label="Поиск эпика в выбранном проекте" value={search} disabled={disabled || !metadata?.epicField} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (!disabled && metadata?.epicField) void loadEpics(); } }} /><WBButton disabled={disabled || !metadata?.epicField} onClick={() => void loadEpics()}>Найти</WBButton></div>
          <label className="cf-field">Привязать к эпику{metadata?.epicRequired ? ' · обязательно в Jira' : ' · необязательно'}<select disabled={disabled || !metadata?.epicField} value={epic} onChange={event => setEpic(event.target.value)}><option value="">{metadata?.epicRequired ? 'Выберите эпик' : 'Без эпика'}</option>{epic && !epics.items.some(item => item.key === epic) && <option value={epic}>{epic} · текущий выбор</option>}{recommended.length > 0 && <optgroup label="Рекомендует ИИ · по соответствию, сверху вниз">{recommended.map((item, index) => <option key={item.key} value={item.key}>{index + 1}. {item.key} · {item.name}</option>)}</optgroup>}<optgroup label={recommended.length ? 'Другие эпики проекта' : 'Эпики выбранного проекта'}>{others.map(item => <option key={item.key} value={item.key}>{item.key} · {item.name}</option>)}</optgroup></select></label>
          {epic && <p className="cf-muted">{recommended.find(item => item.key === epic)?.reason} <a href={`${origin}/browse/${epic}`} target="_blank" rel="noopener noreferrer">Открыть эпик</a></p>}
          {draft && !recommended.length && <p className="cf-muted">ИИ не нашёл подходящего эпика. {metadata?.epicRequired ? 'Выберите его вручную: проект Jira требует привязку.' : 'Можно создать задачу без эпика или выбрать его вручную.'}</p>}
          {epics.nextStart !== null && <p><WBButton disabled={disabled} onClick={() => void loadEpics(epics.nextStart ?? 0)}>Загрузить ещё</WBButton><span className="cf-muted"> При подготовке ИИ прочитает остальные эпики.</span></p>}
          {metadata?.labelsSupported && <div className="cf-jira-labels"><span className="cf-muted">Теги · основной обязателен</span>
            {labels.filter(key => !JIRA_LABELS.some(label => label.key === key)).length > 0 && <p className="cf-muted">Другие теги Jira сохраняются: {labels.filter(key => !JIRA_LABELS.some(label => label.key === key)).join(', ')}</p>}
            {!hasPrimaryLabel && <p className="cf-muted">Для создания задачи выберите хотя бы один основной тег. Теги из группы «Основные / дополнительные» тоже подходят; только дополнительных недостаточно.</p>}
            {!draft?.labels.length && <p className="cf-muted">{draft ? draft.labelsReason || 'ИИ не предложил теги. Выберите их вручную.' : 'Можно выбрать вручную'}</p>}
            <div className="cf-jira-tag-groups">{tagGroups.map(group => {
              const items = JIRA_LABELS.filter(label => label.role === group.role && (labels.includes(label.key) || draft?.labels.some(item => item.key === label.key)));
              if (!items.length) return null;
              return <fieldset key={group.role} className={`cf-jira-tag-group${group.role === 'Основной / дополнительный' ? ' cf-jira-tag-group-shared' : ''}`}><legend>{group.title}</legend><div className="cf-actions">{items.map(label => {
                const recommendation = draft?.labels.find(item => item.key === label.key);
                return <WBButton key={label.key} size="sm" aria-pressed={labels.includes(label.key)} title={recommendation?.reason || label.description} onClick={() => toggleLabel(label.key)} disabled={disabled}>{labels.includes(label.key) ? '✓ ' : '+ '}{label.key}{recommendation && <span className="cf-jira-tag-ai" title="Рекомендует ИИ">ИИ</span>}</WBButton>;
              })}</div></fieldset>;
            })}</div>
            {draft?.labels.length && draft.labelsReason ? <p className="cf-muted">{draft.labelsReason}</p> : null}
            <details><summary>Все теги · {JIRA_LABELS.length}</summary><div className="cf-jira-tag-groups" role="group" aria-label="Все теги">{tagGroups.map(group => <fieldset key={group.role} className={`cf-jira-tag-group${group.role === 'Основной / дополнительный' ? ' cf-jira-tag-group-shared' : ''}`}><legend>{group.title}</legend><div className="cf-jira-tag-list">{JIRA_LABELS.filter(label => label.role === group.role).map(label => <label key={label.key} className="cf-jira-tag"><input type="checkbox" disabled={disabled} checked={labels.includes(label.key)} onChange={() => toggleLabel(label.key)} /><span>{label.key}<span className="cf-muted">{label.description}</span></span></label>)}</div></fieldset>)}</div></details>
          </div>}
          {priorities.length > 0 && <><label className="cf-field">Приоритет<select disabled={disabled || editing && !metadata?.editableFields?.includes('priority')} value={priorityId} onChange={event => setPriorityId(event.target.value)}><option value="">{metadata?.priorityRequired ? 'Выберите приоритет' : 'Не задан'}</option>{priorityId && !priorities.some(priority => priority.id === priorityId) && <option value={priorityId}>{priorityId} · текущий приоритет</option>}{priorities.map(priority => <option key={priority.id} value={priority.id}>{priority.name}</option>)}</select></label>{draft?.priorityReason && <p className="cf-muted">{draft.priorityReason}</p>}{labels.filter(label => JIRA_PRIORITY_RULES[label]).map(label => <p key={label} className="cf-muted">{label}: {JIRA_PRIORITY_RULES[label].join(', ')}</p>)}{conflicts.length > 0 && <p className="cf-error" role="alert">Выбранный приоритет выходит за рекомендованный диапазон: {conflicts.join(', ')}.</p>}</>}
        </section><section><h3>Текст задачи</h3><WBInput label="Название · английский, глагол действия" maxLength={255} disabled={disabled || editing && !metadata?.editableFields?.includes('summary')} value={summary} onChange={event => setSummary(event.target.value)} />
          {editing ? <label className="cf-field">Описание Jira<textarea className="cf-jira-description" rows={18} maxLength={100000} disabled={disabled || !metadata?.editableFields?.includes('description')} value={description} onChange={event => setDescription(event.target.value)} /></label> : <><label className="cf-field">Описание · русский<textarea className="cf-jira-description" rows={6} maxLength={5000} disabled={disabled} value={descriptionRu} onChange={event => setDescriptionRu(event.target.value)} /></label><label className="cf-field">Описание · английский перевод<textarea className="cf-jira-description" rows={6} maxLength={5000} disabled={disabled} value={descriptionEn} onChange={event => setDescriptionEn(event.target.value)} /></label><label className="cf-field">Описание · узбекский перевод (латиница)<textarea className="cf-jira-description" rows={6} maxLength={5000} disabled={disabled} value={descriptionUz} onChange={event => setDescriptionUz(event.target.value)} /></label></>}<p className="cf-muted">Кратко: что делаем, как делаем и для чего. Английский и узбекский переводы должны передавать тот же смысл. В Jira тексты идут подряд без подписей языков.</p><p className="cf-muted">{confluenceUrl ? 'Ссылка на опубликованную страницу Confluence будет добавлена в задачу.' : 'Страница ещё не опубликована. Ссылку можно добавить после публикации.'}</p>
        </section></div>
        <footer className="cf-footer"><span className="cf-muted">{editing ? changed ? 'Есть несохранённые изменения' : 'Задача загружена из Jira' : !epic ? metadata?.epicRequired ? 'Выберите обязательный эпик для создания задачи' : 'Задача будет создана без эпика' : 'Создание после вашего подтверждения'}</span>{editing ? <WBButton variant="accent" disabled={disabled || !canUpdate} onClick={() => void update()}>{busy ? 'Обновление…' : 'Обновить задачу'}</WBButton> : <WBButton variant="accent" disabled={disabled || !canCreate} onClick={() => void act(() => client.create(scope, { methodId, issueKind, summary: summary.trim(), description: jiraDescription(descriptionRu, descriptionEn, descriptionUz), ...(epic ? { epic } : {}), labels, ...(priorityId ? { priorityId } : {}), ...(confluenceUrl ? { confluenceUrl } : {}) }))}>{busy ? 'Создание…' : issueKind === 'task' ? 'Создать задачу' : 'Создать User Story'}</WBButton>}</footer>
        {!status.remembered && <p className="cf-muted">Включите сохранение Jira в локальной форме для защиты от повторного создания задач.</p>}
      </>}
    </>}
  </section>;
}
