import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONFLUENCE_BRIDGE_URL } from '../confluenceClient';
import { jiraClient, type JiraClient, type JiraEpics, type JiraIssue, type JiraIssueResult, type JiraIssueKind, type JiraMetadata, type JiraOperation, type JiraStatus } from '../jiraClient';
import { prepareJiraTaskWithAi } from '../openrouterClient';
import type { JiraDraft, JiraDraftInput } from '../jiraDraft';
import { JIRA_LABELS, JIRA_PRIORITY_RULES, findMediumPriority, jiraDescription } from '../jiraLabels';
import { jiraFormCacheKey, readJiraFormCache, writeJiraFormCache, type JiraFormCache } from '../jiraFormCache';
import { WBButton, WBInput } from './primitives/WorkbenchPrimitives';
import { WorkbenchIcon } from './workbench/WorkbenchIcon';
import { AiRequestProgress } from './AiRequestProgress';

type Props = {
  source?: 'method' | 'freeform';
  onCompletedChange?: (completed: boolean) => void;
  onConnectionScopeChange?: (scope: string) => void;
  headerExtra?: ReactNode;
  methodId: string; methodName: string; methodContext?: string; confluenceUrl?: string; jiraTicket?: string; active?: boolean;
  onBusyChange: (busy: boolean) => void; onLinked?: (methodId: string, issueUrl: string) => void;
  client?: JiraClient; prepareDraft?: (input: JiraDraftInput) => Promise<JiraDraft>;
};

const tagGroups = [
  { title: 'Основные', role: 'Основной', hint: 'Только 1 основной тег' },
  { title: 'Дополнительные', role: 'Дополнительный', hint: 'Только вместе с основным тегом' },
  { title: 'Основные / дополнительные', role: 'Основной / дополнительный', hint: 'Подходит как основной тег' }
] as const;

export function JiraPanel({ methodId, methodName, methodContext = '', confluenceUrl, jiraTicket, source = 'method', active = true, headerExtra, onBusyChange, onLinked, onCompletedChange, onConnectionScopeChange, client = jiraClient, prepareDraft = prepareJiraTaskWithAi }: Props) {
  const [sourceDescription, setSourceDescription] = useState('');
  const [unlinkRevision, setUnlinkRevision] = useState(0);
  const standalone = methodId.startsWith('task-') && !onLinked;
  const [status, setStatus] = useState<JiraStatus>();
  const [metadata, setMetadata] = useState<JiraMetadata>();
  const [issueKind, setIssueKind] = useState<JiraIssueKind>('story');
  const [issueKindExplicit, setIssueKindExplicit] = useState(false);
  const [epics, setEpics] = useState<JiraEpics>({ items: [], nextStart: null });
  const [epic, setEpic] = useState(''); const [search, setSearch] = useState('');
  const [epicQuery, setEpicQuery] = useState('');
  const [summary, setSummary] = useState(''); const [descriptionRu, setDescriptionRu] = useState(''); const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionUz, setDescriptionUz] = useState('');
  const [descLanguageTab, setDescLanguageTab] = useState<'ru' | 'en' | 'uz'>('ru');
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [spotlightSearch, setSpotlightSearch] = useState('');
  const spotlightRef = useRef<HTMLDivElement>(null);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [description, setDescription] = useState(''); const [issue, setIssue] = useState<JiraIssue>();
  const [fingerprint, setFingerprint] = useState(''); const [localConflict, setLocalConflict] = useState(false);
  const [cacheKey, setCacheKey] = useState(''); const [cacheWarning, setCacheWarning] = useState(false);
  const [labels, setLabels] = useState<string[]>([]); const [priorityId, setPriorityId] = useState('');
  const [priorityExplicit, setPriorityExplicit] = useState(false);
  const [draft, setDraft] = useState<JiraDraft>(); const [operation, setOperation] = useState<JiraOperation>();
  const [createdInSession, setCreatedInSession] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);
  useEffect(() => { onCompletedChange?.(operation?.state === 'success' && !operation.updateState); }, [operation, onCompletedChange]);
  const [recovery, setRecovery] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [generating, setGenerating] = useState(false); const [loading, setLoading] = useState(false);
  const [preparationPhase, setPreparationPhase] = useState<'epics' | 'ai'>('epics');
  const lock = useRef(false); const epoch = useRef({ value: 0 }); const linkedCallback = useRef(onLinked);
  const origin = status?.baseUrl ?? ''; const projectId = status?.project?.id;
  useEffect(() => { onConnectionScopeChange?.(status?.connected && origin && projectId ? `${encodeURIComponent(origin)}:${encodeURIComponent(projectId)}` : ''); }, [origin, projectId, status?.connected, onConnectionScopeChange]);
  const bindingRef = useRef(jiraTicket);
  useEffect(() => { bindingRef.current = jiraTicket; }, [jiraTicket]);
  const changed = Boolean(issue && (summary.trim() !== issue.summary || description !== issue.description || epic !== issue.epic || priorityId !== issue.priorityId || JSON.stringify([...labels].sort()) !== JSON.stringify([...issue.labels].sort())));
  const form = { issueKind, issueKindExplicit, summary, descriptionRu, descriptionEn, descriptionUz, description, epic, labels, priorityId, priorityExplicit, search, epicQuery, draft, sourceDescription, ...(issue ? { issueKey: issue.key, fingerprint, dirty: changed } : {}) };
  useEffect(() => {
    const saved = !cacheKey || writeJiraFormCache(cacheKey, form); let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) setCacheWarning(!saved); });
    return () => { cancelled = true; };
  // Only form values belong to the local draft; connection status polling must not reset it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, issueKind, issueKindExplicit, summary, descriptionRu, descriptionEn, descriptionUz, description, epic, labels, priorityId, priorityExplicit, search, epicQuery, draft, sourceDescription, issue?.key, fingerprint, changed]);
  const applyForm = (value: JiraFormCache) => {
    setIssueKindExplicit(value.issueKindExplicit ?? false);
    setPriorityExplicit(value.priorityExplicit ?? false);
    setSourceDescription(value.sourceDescription ?? '');
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
      applyForm({ issueKind: result.metadata.issueKind ?? 'task', summary: result.issue.summary, description: result.issue.description, descriptionRu: '', descriptionEn: '', descriptionUz: '', sourceDescription: cached?.sourceDescription ?? sourceDescription, epic: result.issue.epic, labels: result.issue.labels, priorityId: result.issue.priorityId, priorityExplicit: true, search: '', epicQuery: '', issueKey: result.issue.key, fingerprint: result.issue.fingerprint });
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
      setCacheKey(''); setMetadata(undefined); setOperation(undefined); setIssue(undefined); setLocalConflict(false); setEpics({ items: [], nextStart: null }); setError(''); setLoading(false); setCreatedInSession(false);
      if (!status?.connected || !origin || !projectId) return;
      setLoading(true); const scope = { baseUrl: origin, projectId };
      const key = jiraFormCacheKey(scope, methodId); const cached = readJiraFormCache(key);
      try {
        // The bridge serializes reads: metadata and epic search must not overlap.
        const op = await client.operation(scope, methodId);
        if (generation.value !== current) return;
        setOperation(op);
        let meta: JiraMetadata; let query = '';
        if (op.state === 'success' && op.issue && (bindingRef.current?.trim() || !linkedCallback.current) || op.state === 'none' && bindingRef.current?.trim()) {
          const loaded = await client.issue(scope, methodId, bindingRef.current);
          if (generation.value !== current) return;
          const restored = acceptIssue(loaded, cached); meta = loaded.metadata; query = restored ? cached?.epicQuery ?? '' : '';
        } else {
          const restoredKind = cached?.issueKindExplicit ? cached.issueKind : 'story';
          if (restoredKind !== issueKind) { setIssueKind(restoredKind); return; }
          if (!cached) setIssueKindExplicit(false);
          meta = await client.metadata(scope, issueKind);
          if (generation.value !== current) return;
          setMetadata(meta);
          const defaultMed = findMediumPriority(meta.priorities);
          const resolvedPriorityId = (cached && !cached.issueKey && cached.priorityExplicit && cached.priorityId)
            ? cached.priorityId
            : (defaultMed?.id || meta.defaultPriorityId || meta.priorities?.[0]?.id || '');
          const formToApply: JiraFormCache = cached && !cached.issueKey ? {
            ...cached,
            priorityId: resolvedPriorityId,
            priorityExplicit: cached.priorityExplicit ?? false
          } : {
            issueKind,
            issueKindExplicit: false,
            summary: '',
            descriptionRu: '',
            descriptionEn: '',
            descriptionUz: '',
            description: '',
            epic: '',
            labels: [],
            priorityId: resolvedPriorityId,
            priorityExplicit: false,
            search: '',
            epicQuery: ''
          };
          applyForm(formToApply);
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
  }, [client, origin, projectId, status?.connected, methodId, issueKind, active, unlinkRevision]);
  useEffect(() => {
    if (!isSpotlightOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (spotlightRef.current && !spotlightRef.current.contains(event.target as Node)) {
        setIsSpotlightOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsSpotlightOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSpotlightOpen]);

  useEffect(() => {
    if (!isTagsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (tagsRef.current && !tagsRef.current.contains(event.target as Node)) {
        setIsTagsOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsTagsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTagsOpen]);

  const scope = useMemo(() => ({ baseUrl: origin, projectId: projectId ?? '' }), [origin, projectId]);

  const loadAllRemainingEpics = useCallback(async () => {
    if (epics.nextStart === null || loading) return;
    try {
      let items = [...epics.items];
      let next: number | null = epics.nextStart;
      while (next !== null && items.length < 500) {
        const startOffset: number = next;
        const page = await client.epics(scope, '', startOffset);
        if (!page.items.length) break;
        items = [...items, ...page.items];
        if (page.nextStart === null || page.nextStart <= startOffset) break;
        next = page.nextStart;
      }
      items = [...new Map(items.map(item => [item.key, item])).values()];
      setEpics({ items, nextStart: null });
    } catch {
      // retain current items
    }
  }, [client, epics.items, epics.nextStart, loading, scope]);

  const filterQuery = spotlightSearch.trim().toLowerCase();
  const filteredEpics = useMemo(() => {
    if (!filterQuery) return epics.items;
    return epics.items.filter(item => {
      const keyLower = item.key.toLowerCase();
      const nameLower = item.name.toLowerCase();
      const keyMatch = keyLower.includes(filterQuery);
      const numMatch = /^\d+$/.test(filterQuery) && item.key.includes(filterQuery);
      const nameMatch = nameLower.includes(filterQuery);
      return keyMatch || numMatch || nameMatch;
    });
  }, [epics.items, filterQuery]);
  const readCurrent = async (keepLocal = true, acceptUnknown = false) => {
    if (lock.current) return; lock.current = true; setLoading(true); setError(''); const current = epoch.current.value;
    try {
      const loaded = acceptUnknown && issue ? await client.acceptCurrent(scope, methodId, issue.url, issue.fingerprint) : await client.issue(scope, methodId, bindingRef.current);
      if (current === epoch.current.value) acceptIssue(loaded, keepLocal ? readJiraFormCache(cacheKey) : undefined);
    } catch (failure) { if (current === epoch.current.value) setError(failure instanceof Error ? failure.message : 'Не удалось прочитать задачу.'); }
    finally { lock.current = false; if (current === epoch.current.value) setLoading(false); }
  };
  const unlink = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    const current = epoch.current.value;
    try {
      const result = await client.unlink(scope, methodId);
      if (epoch.current.value !== current) return;
      if (result.state !== 'none') throw new Error('Связь не удалена. Проверьте локальное приложение Jira.');
      if (cacheKey) { try { localStorage.removeItem(cacheKey); } catch { setCacheWarning(true); } }
      bindingRef.current = undefined;
      linkedCallback.current?.(methodId, '');
      setCacheKey(''); setIssue(undefined); setOperation(result); setCreatedInSession(false); setUnlinkRevision(value => value + 1);
    } catch (failure) { if (epoch.current.value === current) setError(failure instanceof Error ? failure.message : 'Не удалось отвязать задачу. Обновите локальное приложение до 1.3.6.'); }
    finally { lock.current = false; if (epoch.current.value === current) { setBusy(false); onBusyChange(false); } }
  };
  const act = async (action: () => Promise<JiraOperation>, isCreation = false) => {
    if (lock.current) return; lock.current = true; setBusy(true); onBusyChange(true); setError(''); const current = epoch.current.value;
    const accept = (result: JiraOperation) => {
      if (epoch.current.value !== current) return;
      setOperation(result);
      if (result.state === 'success' && result.issue) {
        if (isCreation) setCreatedInSession(true);
        linkedCallback.current?.(methodId, result.issue.url);
      }
    };
    try {
      const result = await action(); accept(result);
      if (result.state === 'success' && result.issue && current === epoch.current.value) {
        if (isCreation) setCreatedInSession(true);
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
  const prepare = async () => {
    if (source === 'freeform' && !sourceDescription.trim()) return;
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
      const result = await prepareDraft({ ...(source === 'freeform' ? { source: { kind: 'freeform' as const, description: sourceDescription.trim() } } : {}), method: source === 'freeform' ? { name: 'Свободное описание', context: '' } : { name: methodName, context: methodContext }, project: { key: status.project.key, name: status.project.name }, issueType: metadata.story.name, epics: items.map(({ key, name }) => ({ key, name })), priorities: metadata.priorities ?? [] });
      if (current !== epoch.current.value) return;
      setDraft(result); setSummary(result.summary); setDescriptionRu(result.descriptionRu); setDescriptionEn(result.descriptionEn);
      setDescriptionUz(result.descriptionUz);
      if (issue) setDescription(jiraDescription(result.descriptionRu, result.descriptionEn, result.descriptionUz));
      const cleanedResultLabels: string[] = [];
      let primaryAdded = false;
      for (const item of result.labels) {
        const def = JIRA_LABELS.find(l => l.key === item.key);
        if (def?.role === 'Основной') {
          if (!primaryAdded) { cleanedResultLabels.push(item.key); primaryAdded = true; }
        } else {
          cleanedResultLabels.push(item.key);
        }
      }
      const defaultMed = findMediumPriority(metadata.priorities);
      const targetPriorityId = result.priorityId || (issue ? priorityId : (priorityExplicit ? priorityId : (defaultMed?.id || metadata.defaultPriorityId))) || defaultMed?.id || '';
      setLabels(metadata.labelsSupported ? [...labels.filter(label => !JIRA_LABELS.some(item => item.key === label)), ...cleanedResultLabels] : labels); setPriorityId(targetPriorityId); if (!issue) setEpic('');
    } catch (failure) { if (current === epoch.current.value) setError(failure instanceof Error ? failure.message : 'Не удалось подготовить задачу.'); }
    finally { lock.current = false; setGenerating(false); onBusyChange(false); }
  };
  const recommended = (draft?.rankedEpics ?? []).flatMap(item => { const epic = epics.items.find(epic => epic.key === item.key); return epic ? [{ ...epic, reason: item.reason }] : []; });
  const others = epics.items.filter(item => !recommended.some(epic => epic.key === item.key));
  const priorities = metadata?.priorities ?? [];
  const selectedPriority = priorities.find(priority => priority.id === priorityId);
  const knownPriority = selectedPriority && ['critical', 'highest', 'high', 'medium', 'low'].includes(selectedPriority.name.toLowerCase());
  const conflicts = labels.filter(label => JIRA_PRIORITY_RULES[label] && knownPriority && !JIRA_PRIORITY_RULES[label].some(name => name.toLowerCase() === selectedPriority.name.toLowerCase()));
  const activeTagRules = labels
    .filter(label => JIRA_PRIORITY_RULES[label])
    .map(label => ({
      label,
      rules: JIRA_PRIORITY_RULES[label]
    }));
  const recommendedPriorities = (() => {
    if (!conflicts.length) return [];
    const strict = priorities.filter(p => {
      const pName = p.name.toLowerCase();
      return conflicts.every(label =>
        JIRA_PRIORITY_RULES[label]?.some(name => name.toLowerCase() === pName)
      );
    });
    if (strict.length > 0) return strict;
    return priorities.filter(p => {
      const pName = p.name.toLowerCase();
      return conflicts.some(label =>
        JIRA_PRIORITY_RULES[label]?.some(name => name.toLowerCase() === pName)
      );
    });
  })();
  const priorityTiers = (() => {
    if (!priorities.length) return [];
    const findMatch = (regex: RegExp) => priorities.find(p => regex.test(p.name));
    const highest = findMatch(/^(critical|критическ|блокир|blocker)/i) || findMatch(/^(highest|высочайш)/i) || findMatch(/crit|критич/i);
    const high = findMatch(/^(high\b|high(?!est)|major|высокий|высокая)/i);
    const med = findMatch(/^(medium\b|med\b|normal|средн|обыч)/i) || findMatch(/med|norm|средн|обыч/i);
    const low = findMatch(/^(low\b|low(?!est)|minor|низк(?!айш))/i) || findMatch(/low|minor|trivial|низк/i);

    const mapped = [
      low && { level: 1, id: low.id, name: 'Low', russianName: 'Низкий', color: 'var(--success)', icon: '🌱' },
      med && { level: 2, id: med.id, name: 'Medium', russianName: 'Средний', color: '#eab308', icon: '⚡' },
      high && { level: 3, id: high.id, name: 'High', russianName: 'Высокий', color: '#f97316', icon: '🔥' },
      highest && { level: 4, id: highest.id, name: 'Critical', russianName: 'Критический', color: '#ff003c', icon: '🚨', isCritical: true },
    ].filter(Boolean) as { level: number; id: string; name: string; russianName: string; color: string; icon: string; isCritical?: boolean }[];

    if (mapped.length >= 2) {
      return mapped.map((item, idx) => ({ ...item, level: idx + 1 }));
    }

    const colors = ['var(--success)', '#eab308', '#f97316', '#ff003c'];
    return priorities.slice(0, 4).map((p, idx) => ({
      level: idx + 1,
      id: p.id,
      name: p.name,
      russianName: p.name,
      color: colors[idx] || '#ff003c',
      icon: idx === 0 ? '🌱' : idx === 1 ? '⚡' : idx === 2 ? '🔥' : '🚨',
      isCritical: idx === 3
    }));
  })();

  const activeLevel = (() => {
    if (!priorityId || !selectedPriority) {
      const medTier = priorityTiers.find(t => t.name === 'Medium' || t.level === 2);
      return medTier?.level ?? 2;
    }
    const pName = selectedPriority.name.toLowerCase();
    if (/^(critical|критическ|блокир|blocker|highest|высочайш)/i.test(pName) || /crit|block|критич/i.test(pName)) {
      const t = priorityTiers.find(tier => tier.name === 'Critical' || tier.isCritical || tier.level === 4);
      return t?.level ?? 4;
    }
    if (/^(high\b|high(?!est)|major|высокий|высокая)/i.test(pName)) {
      const t = priorityTiers.find(tier => tier.name === 'High' || tier.level === 3);
      return t?.level ?? 3;
    }
    if (/^(medium\b|med\b|normal|средн|обыч)/i.test(pName) || /med|norm|средн|обыч/i.test(pName)) {
      const t = priorityTiers.find(tier => tier.name === 'Medium' || tier.level === 2);
      return t?.level ?? 2;
    }
    if (/^(low\b|low(?!est)|minor|низк)/i.test(pName) || /trivial/i.test(pName)) {
      const t = priorityTiers.find(tier => tier.name === 'Low' || tier.level === 1);
      return t?.level ?? 1;
    }
    const tier = priorityTiers.find(t => t.id === priorityId);
    return tier?.level ?? 2;
  })();

  const activeTier = priorityTiers.find(t => t.level === activeLevel) || priorityTiers.find(t => t.level === 2) || priorityTiers[0];
  const stepsCount = priorityTiers.length || 4;
  const fillRatio = stepsCount > 1 ? (activeLevel - 1) / (stepsCount - 1) : 0;
  const fillWidth = activeLevel === stepsCount
    ? '100%'
    : `calc(10px + ${fillRatio} * (100% - 20px))`;
  const disabled = busy || generating || loading;
  const hasPrimaryLabel = labels.some(key => JIRA_LABELS.some(label => label.key === key && label.role !== 'Дополнительный'));
  const editing = Boolean(issue); const updateUnknown = operation?.updateState === 'unknown';
  const ready = (editing ? Boolean(metadata?.issueKind) : operation?.state === 'none' && !jiraTicket?.trim() && metadata?.issueKind === issueKind) && typeof metadata?.epicRequired === 'boolean' && metadata.story && !metadata.requiredFields.length;
  const canCreate = ready && status?.remembered && metadata.labelsSupported && hasPrimaryLabel && (!metadata.epicRequired || epic) && summary.trim() && descriptionRu.trim() && descriptionEn.trim() && descriptionUz.trim() && (!metadata.priorityRequired || priorityId);
  const canUpdate = ready && status?.remembered && changed && !localConflict && !updateUnknown && (!metadata.labelsSupported || hasPrimaryLabel) && (!metadata.epicRequired || epic) && summary.trim() && description.trim() && (!metadata.priorityRequired || priorityId);
  const toggleLabel = (key: string) => {
    setLabels(old => {
      const def = JIRA_LABELS.find(l => l.key === key);
      const isAlreadySelected = old.includes(key);
      if (isAlreadySelected) {
        return old.filter(l => l !== key);
      }
      if (def?.role === 'Основной') {
        const withoutOtherPrimaries = old.filter(l => {
          const lDef = JIRA_LABELS.find(item => item.key === l);
          return lDef?.role !== 'Основной';
        });
        return [...withoutOtherPrimaries, key];
      }
      return [...old, key];
    });
  };
  return <section aria-label="Jira" className="cf-jira-panel">
    <div className="cf-jira-header-bar">
      <div className="cf-jira-header-left">
        <span
          className={`cf-status-badge ${status?.connected ? 'is-connected' : 'is-disconnected'}`}
          role="status"
          aria-label={status?.connected ? 'Jira подключена' : 'Jira не подключена'}
          title={status?.connected ? 'Jira подключена' : 'Jira не подключена'}
        >
          <span className="cf-status-dot" aria-hidden="true" />
          <span className="cf-status-label">{status?.connected ? 'Jira' : 'Не подключено'}</span>
        </span>
        {status?.project && (
          <a href={status.project.url} target="_blank" rel="noopener noreferrer" className="cf-jira-project-link">
            <span className="cf-jira-project-name">{status.project.name}</span>
            <span className="cf-jira-project-key">{status.project.key}</span>
          </a>
        )}
        <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer" className="cf-jira-change-link">
          <WorkbenchIcon name="edit" />
          <span>{status?.connected ? 'Изменить проект' : 'Подключить Jira локально'}</span>
        </a>
      </div>
      {headerExtra && <div className="cf-jira-header-right">{headerExtra}</div>}
    </div>
    {!status?.connected && <p className="cf-notice">Подключите Jira в той же локальной форме, что и Confluence. Ссылка на любую задачу определит проект. Нужна версия локального приложения 1.3.4 или новее. <a href="/docbuilder-confluence-local.zip" download>Скачать</a></p>}
    {error && <p role="alert" className="cf-notice cf-error">{error}</p>}
    {cacheWarning && <p role="alert" className="cf-notice">Браузер не смог сохранить черновик локально. Не закрывайте форму до сохранения в Jira.</p>}
    {generating && <div className="cf-notice"><AiRequestProgress message={preparationPhase === 'epics' ? 'Подготовка ИИ: загружаем эпики проекта…' : 'ИИ: готовим название, описание и рекомендации…'} /></div>}
    {status?.connected && <>
      {loading && <p role="status">Чтение Jira…</p>}
      {(() => {
        const isLinkedCardVisible = Boolean((operation?.state === 'none' && jiraTicket?.trim()) || operation?.state === 'success');
        if (!isLinkedCardVisible) return null;

        const currentIssueKey = operation?.issue?.key || issue?.key || (jiraTicket ? jiraTicket.split('/').pop()?.trim() : '');
        const currentIssueUrl = operation?.issue?.url || issue?.url || (jiraTicket?.startsWith('http') ? jiraTicket : (status?.baseUrl && currentIssueKey ? `${status.baseUrl.replace(/\/+$/, '')}/browse/${currentIssueKey}` : undefined));
        const displaySummary = issue?.summary || summary || '';
        const currentEpicKey = issue?.epic || epic;
        const currentEpicObj = currentEpicKey ? epics.items.find(e => e.key === currentEpicKey) : undefined;
        const currentEpicName = currentEpicObj?.name;
        const statusTitle = createdInSession || standalone
          ? 'Задача создана'
          : !createdInSession && onLinked && !jiraTicket && !issue
            ? 'В локальном журнале найдена ранее созданная задача'
            : 'Метод уже связан с задачей Jira';

        const copyTicketUrl = () => {
          if (!currentIssueUrl) return;
          if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
          const onDone = () => {
            setCopied(true);
            copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
          };
          if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(currentIssueUrl).then(onDone).catch(() => {
              try {
                const el = document.createElement('textarea');
                el.value = currentIssueUrl;
                el.style.position = 'fixed';
                el.style.opacity = '0';
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                onDone();
              } catch {
                // ignore
              }
            });
          } else {
            try {
              const el = document.createElement('textarea');
              el.value = currentIssueUrl;
              el.style.position = 'fixed';
              el.style.opacity = '0';
              document.body.appendChild(el);
              el.select();
              document.execCommand('copy');
              document.body.removeChild(el);
              onDone();
            } catch {
              // ignore
            }
          }
        };

        return (
          <div className="cf-jira-linked-hub">
            {/* ROW 1: PRIMARY ENTITY (Key + Title + Actions) */}
            <div className="cf-jira-hub-primary-row">
              <div className="cf-jira-hub-primary-main">
                {currentIssueKey && (
                  currentIssueUrl ? (
                    <a
                      href={currentIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cf-jira-hub-key-link"
                      aria-label={currentIssueKey}
                      title={`Открыть ${currentIssueKey} в Jira`}
                    >
                      <span>{currentIssueKey}</span>
                      <span aria-hidden="true" className="cf-jira-hub-arrow">↗</span>
                    </a>
                  ) : (
                    <span className="cf-jira-hub-key-link">{currentIssueKey}</span>
                  )
                )}
                {displaySummary && (
                  <span className="cf-jira-hub-title-text" title={displaySummary}>
                    {displaySummary}
                  </span>
                )}
              </div>

              <div className="cf-jira-hub-header-right">
                {!createdInSession && onLinked && !jiraTicket && !issue && (
                  <WBButton
                    size="sm"
                    disabled={disabled}
                    onClick={() => void readCurrent()}
                  >
                    Привязать к текущему методу
                  </WBButton>
                )}
                {confluenceUrl && operation?.issue && operation.linkedUrl !== confluenceUrl && (
                  <WBButton
                    size="sm"
                    disabled={disabled}
                    onClick={() => void act(() => client.link(scope, methodId, confluenceUrl))}
                  >
                    Добавить ссылку Confluence
                  </WBButton>
                )}
                {currentIssueUrl && (
                  <button
                    type="button"
                    className={`cf-jira-hub-icon-action${copied ? ' is-copied' : ''}`}
                    onClick={copyTicketUrl}
                    aria-label={copied ? 'Ссылка скопирована' : 'Скопировать ссылку на задачу'}
                    title={copied ? 'Ссылка скопирована!' : 'Скопировать ссылку на задачу'}
                  >
                    <WorkbenchIcon name={copied ? 'check' : 'copy'} />
                  </button>
                )}
                {currentIssueUrl && (
                  <a
                    href={currentIssueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cf-jira-hub-open-btn cf-jira-hub-btn-secondary"
                    title={`Открыть ${currentIssueKey || 'задачу'} в Jira`}
                  >
                    <span>В Jira</span>
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
                {onLinked && (
                  <button
                    type="button"
                    className="cf-jira-hub-icon-action is-danger"
                    disabled={disabled || operation?.updateState === 'unknown'}
                    onClick={() => void unlink()}
                    aria-label="Отвязать задачу"
                    title="Отвязать задачу от метода (задача в Jira остаётся)"
                  >
                    <WorkbenchIcon name="trash" />
                  </button>
                )}
              </div>
            </div>

            {/* ROW 2: SUBORDINATE METADATA CHIPS */}
            <div className="cf-jira-hub-meta-row">
              <div className="cf-jira-hub-status-badge">
                <WorkbenchIcon name="check" />
                <h3 className="cf-jira-hub-status-heading">{statusTitle}</h3>
              </div>
              <span className="cf-jira-hub-chip">
                {issue?.issueType?.name || (issueKind === 'story' ? 'User Story' : 'Задача · тестирование')}
              </span>
              {activeTier && (
                <span className={`cf-jira-hub-chip priority tier-${activeTier.isCritical ? 'critical' : activeTier.name?.toLowerCase()}`}>
                  {activeTier.icon} {activeTier.russianName || activeTier.name}
                </span>
              )}
              {currentEpicKey && (
                <span className="cf-jira-hub-chip epic" title={`Эпик: ${currentEpicName || currentEpicKey}`}>
                  📁 {currentEpicKey}{currentEpicName ? ` · ${currentEpicName}` : ''}
                </span>
              )}
              {operation?.linkedUrl && (
                <a
                  href={operation.linkedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cf-jira-hub-chip cf-jira-hub-chip-confluence"
                  title="Документация Confluence"
                >
                  📄 Confluence <span aria-hidden="true">↗</span>
                </a>
              )}
            </div>

            {operation?.message && <div className="cf-jira-hub-subtext">{operation.message}</div>}

          </div>
        );
      })()}
      {localConflict && <div className="cf-notice" role="alert"><p>Задача изменилась в Jira. Местные правки сохранены; обновление заблокировано до выбора версии.</p><details><summary>Текущая версия Jira</summary><p>{issue?.summary}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{issue?.description}</pre><p>Эпик: {issue?.epic || 'Без эпика'} · Теги: {issue?.labels.join(', ')} · Приоритет: {issue?.priorityId || 'Не задан'}</p></details><div className="cf-actions"><WBButton disabled={disabled} onClick={() => void readCurrent(false)}>Использовать версию Jira</WBButton><WBButton disabled={disabled || updateUnknown} onClick={() => { setFingerprint(issue?.fingerprint ?? ''); setLocalConflict(false); }}>Оставить мои правки</WBButton></div></div>}
      {updateUnknown && <div className="cf-notice" role="alert"><h3>Результат обновления не подтверждён</h3><p>Повторное обновление заблокировано. Черновик сохранён локально.</p><div className="cf-actions"><WBButton disabled={disabled} onClick={() => void readCurrent()}>Проверить обновление</WBButton><WBButton disabled={disabled} onClick={() => void readCurrent(false, true)}>Принять текущую версию Jira</WBButton></div></div>}
      {operation?.state === 'unknown' ? <div className="cf-notice"><h3>Результат создания не подтверждён</h3><p>Проверьте Jira. Повторное создание заблокировано, чтобы избежать дублей.</p><WBInput label="Ссылка на созданную задачу" value={recovery} onChange={event => setRecovery(event.target.value)} /><p><WBButton disabled={disabled || !recovery.trim()} onClick={() => void act(() => client.confirm(scope, methodId, recovery.trim()))}>Проверить и привязать задачу</WBButton></p></div> : (!createdInSession && (editing || operation?.state === 'none' && !jiraTicket?.trim())) && <>
        {metadata?.message && <p role="alert" className="cf-notice">{metadata.message}</p>}
        {!editing && metadata?.story && metadata.labelsSupported === false && <p role="alert" className="cf-notice cf-error">В Jira недоступно поле тегов для выбранного типа задачи. Добавьте его на экран создания в Jira: основной тег обязателен.</p>}
        {!editing && metadata && (metadata.issueKind !== issueKind || typeof metadata.epicRequired !== 'boolean') && <p role="alert" className="cf-notice cf-error">Обновите локальный сервис до версии 1.3.4. <a href="/docbuilder-confluence-local.zip" download>Скачать</a></p>}
        {source === 'freeform' && !editing && <label className="cf-field">Что нужно сделать<textarea aria-label="Что нужно сделать" rows={6} maxLength={20000} disabled={disabled} value={sourceDescription} placeholder="Опишите задачу своими словами…" onChange={event => setSourceDescription(event.target.value)} /><span className="cf-muted">ИИ получит только это описание и справочники Jira. Текущий метод не используется.</span></label>}
        <div className="cf-jira-toolbar">{editing ? <span className="cf-muted">Тип задачи: {issue?.issueType.name}</span> : <label className="cf-field">Тип задачи<select value={issueKind} disabled={disabled} onChange={event => { const next = event.target.value as JiraIssueKind; if (cacheKey) writeJiraFormCache(cacheKey, { ...form, issueKind: next, issueKindExplicit: true }); setIssueKindExplicit(true); setIssueKind(next); }}><option value="task">Задача · тестирование</option><option value="story">User Story</option></select></label>}<WBButton disabled={disabled || !ready || updateUnknown || localConflict || source === 'freeform' && !sourceDescription.trim() || editing && (!metadata?.editableFields?.includes('summary') || !metadata?.editableFields?.includes('description'))} onClick={() => void prepare()}>{generating ? 'Подготовка через ИИ…' : draft ? 'Подготовить заново' : 'Подготовить через ИИ'}</WBButton></div>
        
        {metadata?.epicRequired && <p className="cf-notice">В выбранном проекте Jira эпик обязателен. Выберите его вручную, если рекомендации не подходят.</p>}
        {!loading && ready && !epics.items.length && <p className="cf-notice">{epicQuery ? 'По этому запросу эпики не найдены. Можно изменить поиск.' : 'В выбранном проекте нет доступных эпиков.'}{!metadata.epicRequired && ' Текст, теги и приоритет можно подготовить, а задачу — создать без эпика.'}</p>}
        <div className="cf-grid"><section><h3>Назначение задачи</h3>
          <div className="cf-jira-epic-block" ref={spotlightRef}>
            <span className="cf-jira-epic-label">Привязать к эпику{metadata?.epicRequired ? ' · обязательно в Jira' : ' · необязательно'}</span>
            <div className="cf-jira-pills-row" role="group" aria-label="Выбор эпика">
              {!metadata?.epicRequired && (
                <button
                  type="button"
                  className={`cf-jira-pill ${!epic ? 'cf-jira-pill-active' : ''}`}
                  disabled={disabled || !metadata?.epicField}
                  onClick={() => { setEpic(''); setIsSpotlightOpen(false); }}
                >
                  {!epic && (
                    <span className="cf-jira-pill-check">
                      <WorkbenchIcon name="check" />
                    </span>
                  )}
                  <span>Без эпика</span>
                </button>
              )}
              {recommended.slice(0, 3).map((item, index) => {
                const isSelected = epic === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`cf-jira-pill cf-jira-pill-ai ${isSelected ? 'cf-jira-pill-active' : ''}`}
                    disabled={disabled || !metadata?.epicField}
                    title={`Рекомендация ИИ #${index + 1}: ${item.reason || item.name}`}
                    onClick={() => { setEpic(item.key); setIsSpotlightOpen(false); }}
                  >
                    <span className="cf-jira-pill-badge">
                      <WorkbenchIcon name="ai-describe" />
                      <span>#{index + 1}</span>
                    </span>
                    <span className="cf-jira-pill-key">{item.key}</span>
                    <span className="cf-jira-pill-name">{item.name}</span>
                    {isSelected && (
                      <span className="cf-jira-pill-check">
                        <WorkbenchIcon name="check" />
                      </span>
                    )}
                  </button>
                );
              })}
              {epic && !recommended.slice(0, 3).some(r => r.key === epic) && (
                <div className="cf-jira-pill cf-jira-pill-active">
                  <span className="cf-jira-pill-key">{epic}</span>
                  <span className="cf-jira-pill-name">{epics.items.find(i => i.key === epic)?.name || 'Выбранный эпик'}</span>
                  {!metadata?.epicRequired && (
                    <button
                      type="button"
                      className="cf-jira-pill-clear"
                      title="Сбросить выбор"
                      onClick={() => setEpic('')}
                    >
                      <WorkbenchIcon name="close" />
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                className={`cf-jira-spotlight-trigger ${isSpotlightOpen ? 'cf-jira-spotlight-trigger-active' : ''}`}
                disabled={disabled || !metadata?.epicField}
                onClick={() => {
                  setIsSpotlightOpen(old => !old);
                  setSpotlightSearch('');
                  if (!isSpotlightOpen && epics.nextStart !== null) void loadAllRemainingEpics();
                }}
                aria-expanded={isSpotlightOpen}
                aria-haspopup="listbox"
              >
                <span className="cf-jira-spotlight-btn-icon">
                  <WorkbenchIcon name="search" />
                </span>
                <span>Все эпики ({epics.items.length}{epics.nextStart !== null ? '+' : ''})</span>
                <span className={`cf-jira-spotlight-arrow ${isSpotlightOpen ? 'open' : ''}`}>
                  <WorkbenchIcon name="chevron" />
                </span>
              </button>
            </div>

            {isSpotlightOpen && (
              <div className="cf-jira-spotlight-popover" role="dialog" aria-label="Поиск эпика">
                <div className="cf-jira-spotlight-search-box">
                  <span className="cf-jira-spotlight-icon" aria-hidden="true">
                    <WorkbenchIcon name="search" />
                  </span>
                  <input
                    type="text"
                    className="cf-jira-spotlight-search-input"
                    placeholder="Номер (20492), ключ или название…"
                    value={spotlightSearch}
                    onChange={event => setSpotlightSearch(event.target.value)}
                    autoFocus
                  />
                  {spotlightSearch && (
                    <button
                      type="button"
                      className="cf-jira-spotlight-clear-search"
                      onClick={() => setSpotlightSearch('')}
                      title="Очистить"
                    >
                      <WorkbenchIcon name="close" />
                    </button>
                  )}
                  <span className="cf-jira-spotlight-count">
                    {filteredEpics.length} из {epics.items.length}
                  </span>
                </div>
                <div className="cf-jira-spotlight-items" role="listbox">
                  {!metadata?.epicRequired && (
                    <button
                      type="button"
                      role="option"
                      aria-selected={!epic}
                      className={`cf-jira-spotlight-item ${!epic ? 'cf-jira-spotlight-item-selected' : ''}`}
                      onClick={() => { setEpic(''); setIsSpotlightOpen(false); }}
                    >
                      <span className="cf-jira-spotlight-item-name">Без эпика</span>
                      {!epic && (
                        <span className="cf-jira-spotlight-check">
                          <WorkbenchIcon name="check" />
                        </span>
                      )}
                    </button>
                  )}
                  {filteredEpics.length === 0 ? (
                    <div className="cf-jira-spotlight-empty">Ничего не найдено по запросу «{spotlightSearch}»</div>
                  ) : (
                    filteredEpics.map(item => {
                      const isSelected = epic === item.key;
                      const recIndex = recommended.findIndex(r => r.key === item.key);
                      const rec = recIndex >= 0 ? recommended[recIndex] : undefined;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`cf-jira-spotlight-item ${isSelected ? 'cf-jira-spotlight-item-selected' : ''}`}
                          onClick={() => { setEpic(item.key); setIsSpotlightOpen(false); }}
                          title={rec?.reason || item.name}
                        >
                          <span className="cf-jira-spotlight-item-key">{item.key}</span>
                          <span className="cf-jira-spotlight-item-name">{item.name}</span>
                          {rec && (
                            <span className="cf-jira-spotlight-item-badge" title={rec.reason}>
                              <WorkbenchIcon name="ai-describe" /> #{recIndex + 1}
                            </span>
                          )}
                          {isSelected && (
                            <span className="cf-jira-spotlight-check">
                              <WorkbenchIcon name="check" />
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {epic && (
              <p className="cf-muted cf-jira-epic-caption">
                {recommended.find(item => item.key === epic)?.reason && (
                  <span className="cf-jira-epic-reason">{recommended.find(item => item.key === epic)?.reason} · </span>
                )}
                <a href={`${origin}/browse/${epic}`} target="_blank" rel="noopener noreferrer">
                  Открыть {epic} в Jira ↗
                </a>
              </p>
            )}
            {draft && !recommended.length && (
              <p className="cf-muted">ИИ не нашёл подходящего эпика. {metadata?.epicRequired ? 'Выберите его вручную: проект Jira требует привязку.' : 'Можно создать задачу без эпика или выбрать его вручную.'}</p>
            )}

            <div className="cf-visually-hidden">
              <label>
                Привязать к эпику{metadata?.epicRequired ? ' · обязательно в Jira' : ' · необязательно'}
                <select
                  disabled={disabled || !metadata?.epicField}
                  value={epic}
                  onChange={event => setEpic(event.target.value)}
                >
                  <option value="">{metadata?.epicRequired ? 'Выберите эпик' : 'Без эпика'}</option>
                  {epic && !epics.items.some(item => item.key === epic) && <option value={epic}>{epic} · текущий выбор</option>}
                  {recommended.length > 0 && (
                    <optgroup label="Рекомендует ИИ · по соответствию, сверху вниз">
                      {recommended.map((item, index) => (
                        <option key={item.key} value={item.key}>
                          {index + 1}. {item.key} · {item.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={recommended.length ? 'Другие эпики проекта' : 'Эпики выбранного проекта'}>
                    {others.map(item => (
                      <option key={item.key} value={item.key}>
                        {item.key} · {item.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
            </div>
          </div>
          {metadata?.labelsSupported && (
            <div className="cf-jira-labels" ref={tagsRef}>
              <div className="cf-jira-labels-header">
                <span className="cf-jira-labels-title">Теги · основной обязателен</span>
              </div>
              {labels.filter(key => !JIRA_LABELS.some(label => label.key === key)).length > 0 && (
                <p className="cf-muted">Другие теги Jira сохраняются: {labels.filter(key => !JIRA_LABELS.some(label => label.key === key)).join(', ')}</p>
              )}

              {draft && !draft.labels.length && draft.labelsReason && (
                <p className="cf-muted cf-jira-tag-reason-hint">{draft.labelsReason}</p>
              )}

              {/* Hybrid Tag Picker: Closed state input frame with chips and Add Tag Pill */}
              <div
                className={`cf-jira-tags-input-frame ${isTagsOpen ? 'cf-jira-tags-input-frame-active' : ''}`}
                onClick={() => {
                  if (!disabled) setIsTagsOpen(prev => !prev);
                }}
              >
                <div className="cf-jira-tags-chips-wrap">
                  {labels.map(key => {
                    const labelDef = JIRA_LABELS.find(l => l.key === key);
                    const isPrimary = labelDef?.role === 'Основной' || labelDef?.role === 'Основной / дополнительный';
                    return (
                      <span
                        key={key}
                        className={`cf-jira-tag-chip ${isPrimary ? 'primary' : 'extra'}`}
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="cf-jira-tag-chip-key">{key}</span>
                        <span className="cf-jira-tag-chip-role">
                          {labelDef?.role === 'Основной' ? 'осн.' : labelDef?.role === 'Дополнительный' ? 'доп.' : 'осн/доп'}
                        </span>
                        <button
                          type="button"
                          className="cf-jira-tag-chip-del"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLabel(key);
                          }}
                          disabled={disabled}
                          title={`Убрать тег ${key}`}
                          aria-label={`Убрать тег ${key}`}
                        >
                          <WorkbenchIcon name="close" />
                        </button>
                      </span>
                    );
                  })}

                  <button
                    type="button"
                    className={`cf-jira-tag-add-pill ${isTagsOpen ? 'active' : ''} ${labels.length === 0 ? 'empty' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTagsOpen(prev => !prev);
                    }}
                    disabled={disabled}
                    aria-expanded={isTagsOpen}
                  >
                    <span className="cf-jira-tag-add-icon" aria-hidden="true">
                      <WorkbenchIcon name="plus" />
                    </span>
                    <span className="cf-jira-tags-trigger-title">Тег</span>
                    <span className={`cf-jira-tags-trigger-arrow ${isTagsOpen ? 'open' : ''}`} aria-hidden="true">
                      <WorkbenchIcon name="chevron" />
                    </span>
                  </button>

                  {labels.length === 0 && (
                    <span className="cf-jira-tags-placeholder">← нажмите для выбора тегов (минимум 1 основной)</span>
                  )}
                </div>
              </div>
              {/* Hybrid Tag Picker: Open state floating popover with interactive Matrix of Pills */}
              {isTagsOpen && (
                <div className="cf-jira-tags-popover" role="group" aria-label="Все теги">
                  {draft?.labels && draft.labels.length > 0 && (
                    <div className="cf-jira-tags-ai-recs">
                      <div className="cf-jira-tags-ai-recs-header">
                        <WorkbenchIcon name="ai-describe" />
                        <span>Рекомендовано ИИ{draft.labelsReason ? ` · ${draft.labelsReason}` : ''}:</span>
                      </div>
                      <div className="cf-jira-tags-ai-recs-row">
                        {draft.labels.map(rec => {
                          const isSelected = labels.includes(rec.key);
                          const labelDef = JIRA_LABELS.find(l => l.key === rec.key);
                          const isPrimary = labelDef?.role === 'Основной' || labelDef?.role === 'Основной / дополнительный';
                          return (
                            <WBButton
                              key={rec.key}
                              size="sm"
                              aria-pressed={isSelected}
                              icon={isSelected ? <WorkbenchIcon name="check" /> : <WorkbenchIcon name="plus" />}
                              title={rec.reason || labelDef?.description}
                              onClick={() => toggleLabel(rec.key)}
                              disabled={disabled}
                            >
                              <span className="cf-jira-tag-btn-key">{rec.key}</span>
                              <span className={`cf-jira-tag-role-pill ${isPrimary ? 'primary' : 'extra'}`}>
                                {labelDef?.role === 'Основной' ? 'осн.' : labelDef?.role === 'Дополнительный' ? 'доп.' : 'осн/доп'}
                              </span>
                            </WBButton>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="cf-jira-matrix-groups">
                    {tagGroups.map(group => (
                      <fieldset
                        key={group.role}
                        role="group"
                        aria-label={group.title}
                        className="cf-jira-matrix-group"
                      >
                        <div className="cf-jira-matrix-group-header">
                          <legend className="cf-jira-matrix-group-legend">{group.title}</legend>
                          <span className="cf-jira-matrix-group-hint">{group.hint}</span>
                        </div>
                        <div className="cf-jira-matrix-pills">
                          {JIRA_LABELS.filter(label => label.role === group.role).map(label => {
                            const isChecked = labels.includes(label.key);
                            const isAiRecommended = draft?.labels?.some(rec => rec.key === label.key);
                            return (
                              <label
                                key={label.key}
                                className={`cf-jira-matrix-pill ${isChecked ? 'cf-jira-matrix-pill-active' : ''} ${isAiRecommended ? 'cf-jira-matrix-pill-ai' : ''}`}
                                title={label.description}
                              >
                                <input
                                  type="checkbox"
                                  className="cf-visually-hidden"
                                  aria-label={label.key}
                                  disabled={disabled}
                                  checked={isChecked}
                                  onChange={() => toggleLabel(label.key)}
                                />
                                {isChecked ? (
                                  <span className="cf-jira-matrix-pill-check" aria-hidden="true">
                                    <WorkbenchIcon name="check" />
                                  </span>
                                ) : (
                                  <span className="cf-jira-matrix-pill-plus" aria-hidden="true">
                                    <WorkbenchIcon name="plus" />
                                  </span>
                                )}
                                <span className="cf-jira-matrix-pill-key">{label.key}</span>
                                {isAiRecommended && (
                                  <span className="cf-jira-matrix-pill-badge" title="Рекомендовано ИИ">
                                    <WorkbenchIcon name="ai-describe" />
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ))}
                  </div>

                  <div className="cf-jira-tags-popover-footer">
                    <span className="cf-muted">Нажмите на тег для добавления или снятия</span>
                    <button
                      type="button"
                      className="cf-jira-tags-close-btn"
                      onClick={() => setIsTagsOpen(false)}
                    >
                      Готово
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
                    {priorities.length > 0 && (
            <div className="cf-jira-priority-block">
              <div className="cf-jira-boost-container">
                <div className="cf-jira-range-track-wrap">
                  <div className="cf-jira-range-track-bg" />
                  <div
                    className={`cf-jira-range-fill lvl-${activeLevel}`}
                    style={{
                      width: fillWidth
                    }}
                  />
                  <input
                    type="range"
                    aria-label="Приоритет"
                    className="cf-jira-range-input"
                    min={1}
                    max={priorityTiers.length || 4}
                    step={1}
                    value={activeLevel}
                    disabled={disabled || (editing && !metadata?.editableFields?.includes('priority'))}
                    style={{
                      '--thumb-color': activeTier?.color || '#eab308'
                    } as React.CSSProperties}
                    onChange={event => {
                      const lvl = Number(event.target.value);
                      const targetTier = priorityTiers.find(t => t.level === lvl);
                      if (targetTier) { setPriorityId(targetTier.id); setPriorityExplicit(true); }
                    }}
                  />
                  <div className="cf-jira-range-steps" role="group" aria-label="Уровень приоритета">
                    {priorityTiers.map(tier => {
                      const isCurrent = activeLevel === tier.level;
                      const isRecommended = recommendedPriorities.some(r => r.id === tier.id);
                      return (
                        <button
                          key={tier.id}
                          type="button"
                          className={`cf-jira-range-step-btn ${isCurrent ? 'active' : ''} tier-${tier.level} ${isRecommended ? 'recommended' : ''}`}
                          disabled={disabled || (editing && !metadata?.editableFields?.includes('priority'))}
                          onClick={() => { setPriorityId(tier.id); setPriorityExplicit(true); }}
                          title={`${tier.name} (${tier.russianName})${isRecommended ? ' · Рекомендуется правилами тегов' : ''}`}
                        >
                          <span className="cf-jira-range-step-name">{tier.name}</span>
                          <span className="cf-jira-range-step-sub">{tier.russianName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <select
                id="cf-jira-priority-select"
                aria-label="Приоритет"
                style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}
                disabled={disabled || (editing && !metadata?.editableFields?.includes('priority'))}
                value={priorityId}
                onChange={event => { setPriorityId(event.target.value); setPriorityExplicit(true); }}
              >
                <option value="">{metadata?.priorityRequired ? 'Выберите приоритет' : 'Не задан'}</option>
                {priorityId && !priorities.some(priority => priority.id === priorityId) && (
                  <option value={priorityId}>{priorityId} · текущий приоритет</option>
                )}
                {priorities.map(priority => (
                  <option key={priority.id} value={priority.id}>
                    {priority.name}
                  </option>
                ))}
              </select>

              {draft?.priorityReason && (
                <div className="cf-jira-priority-ai-hint">
                  <span className="cf-jira-priority-ai-icon" aria-hidden="true">
                    <WorkbenchIcon name="ai-describe" />
                  </span>
                  <span className="cf-jira-priority-ai-text">{draft.priorityReason}</span>
                </div>
              )}

              {conflicts.length > 0 && activeTagRules.length > 0 && (
                <div className="cf-jira-priority-rules-hint">
                  <span className="cf-muted">Правила тегов: </span>
                  {activeTagRules.map(({ label, rules }) => (
                    <span key={label} className="cf-jira-priority-rule-chip">
                      <code>{label}</code> → {rules.join(', ')}
                    </span>
                  ))}
                </div>
              )}

              {conflicts.length > 0 && (
                <div className="cf-jira-priority-conflict" role="alert">
                  <div className="cf-jira-priority-conflict-header">
                    <span className="cf-jira-priority-conflict-icon" aria-hidden="true">
                      <WorkbenchIcon name="alert" />
                    </span>
                    <span className="cf-jira-priority-conflict-title">
                      Выбранный приоритет выходит за рекомендованный диапазон: {conflicts.join(', ')}.
                    </span>
                  </div>
                  {recommendedPriorities.length > 0 && (
                    <div className="cf-jira-priority-conflict-actions">
                      <span className="cf-jira-priority-conflict-hint">Рекомендовано правилами:</span>
                      <div className="cf-jira-priority-quick-buttons">
                        {recommendedPriorities.map(rec => (
                          <button
                            key={rec.id}
                            type="button"
                            className="cf-jira-priority-quick-btn"
                            onClick={() => { setPriorityId(rec.id); setPriorityExplicit(true); }}
                            disabled={disabled || (editing && !metadata?.editableFields?.includes('priority'))}
                          >
                            <WorkbenchIcon name="check" />
                            <span>Применить {rec.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section><section><h3>Данные для Jira</h3><WBInput label="Название · английский, глагол действия" maxLength={255} disabled={disabled || editing && !metadata?.editableFields?.includes('summary')} value={summary} onChange={event => setSummary(event.target.value)} />
          {editing ? <label className="cf-field">Описание Jira<textarea className="cf-jira-description" rows={18} maxLength={100000} disabled={disabled || !metadata?.editableFields?.includes('description')} value={description} onChange={event => setDescription(event.target.value)} /></label> : (
            <div className="cf-jira-lang-container">
              <div className="cf-jira-lang-tabs-header">
                <div className="cf-jira-lang-tabs" role="tablist" aria-label="Язык описания">
                  <button
                    type="button"
                    role="tab"
                    className={`cf-jira-lang-tab ${descLanguageTab === 'ru' && !showAllLanguages ? 'cf-jira-lang-tab-active' : ''}`}
                    aria-selected={descLanguageTab === 'ru' && !showAllLanguages}
                    onClick={() => { setDescLanguageTab('ru'); setShowAllLanguages(false); }}
                  >
                    <span>Русский</span>
                    <span className={`cf-jira-lang-indicator ${descriptionRu.trim() ? 'cf-jira-lang-filled' : 'cf-jira-lang-empty'}`}>
                      {descriptionRu.trim() ? <WorkbenchIcon name="check" /> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`cf-jira-lang-tab ${descLanguageTab === 'en' && !showAllLanguages ? 'cf-jira-lang-tab-active' : ''}`}
                    aria-selected={descLanguageTab === 'en' && !showAllLanguages}
                    onClick={() => { setDescLanguageTab('en'); setShowAllLanguages(false); }}
                  >
                    <span>English</span>
                    <span className={`cf-jira-lang-indicator ${descriptionEn.trim() ? 'cf-jira-lang-filled' : 'cf-jira-lang-empty'}`}>
                      {descriptionEn.trim() ? <WorkbenchIcon name="check" /> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`cf-jira-lang-tab ${descLanguageTab === 'uz' && !showAllLanguages ? 'cf-jira-lang-tab-active' : ''}`}
                    aria-selected={descLanguageTab === 'uz' && !showAllLanguages}
                    onClick={() => { setDescLanguageTab('uz'); setShowAllLanguages(false); }}
                  >
                    <span>O'zbek</span>
                    <span className={`cf-jira-lang-indicator ${descriptionUz.trim() ? 'cf-jira-lang-filled' : 'cf-jira-lang-empty'}`}>
                      {descriptionUz.trim() ? <WorkbenchIcon name="check" /> : null}
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  className="cf-jira-lang-toggle"
                  onClick={() => setShowAllLanguages(old => !old)}
                  title="Показать все языки сразу или переключаться вкладками"
                >
                  {showAllLanguages ? 'Вкладками' : 'Все 3 языка'}
                </button>
              </div>
              <div className={`cf-jira-lang-panel ${!showAllLanguages && descLanguageTab !== 'ru' ? 'cf-jira-lang-panel-hidden' : ''}`}>
                <label className="cf-field">
                  Описание · русский
                  <textarea className="cf-jira-description" rows={showAllLanguages ? 5 : 10} maxLength={5000} disabled={disabled} value={descriptionRu} onChange={event => setDescriptionRu(event.target.value)} />
                </label>
              </div>
              <div className={`cf-jira-lang-panel ${!showAllLanguages && descLanguageTab !== 'en' ? 'cf-jira-lang-panel-hidden' : ''}`}>
                <label className="cf-field">
                  Описание · английский перевод
                  <textarea className="cf-jira-description" rows={showAllLanguages ? 5 : 10} maxLength={5000} disabled={disabled} value={descriptionEn} onChange={event => setDescriptionEn(event.target.value)} />
                </label>
              </div>
              <div className={`cf-jira-lang-panel ${!showAllLanguages && descLanguageTab !== 'uz' ? 'cf-jira-lang-panel-hidden' : ''}`}>
                <label className="cf-field">
                  Описание · узбекский перевод (латиница)
                  <textarea className="cf-jira-description" rows={showAllLanguages ? 5 : 10} maxLength={5000} disabled={disabled} value={descriptionUz} onChange={event => setDescriptionUz(event.target.value)} />
                </label>
              </div>
            </div>
          )}
        </section></div>
        <footer className="cf-footer"><span className="cf-muted">{editing ? changed ? 'Есть несохранённые изменения' : 'Задача загружена из Jira' : metadata?.epicRequired && !epic ? 'Выберите обязательный эпик для создания задачи' : ''}</span>{editing ? <WBButton variant="accent" disabled={disabled || !canUpdate} onClick={() => void update()}>{busy ? 'Обновление…' : 'Обновить задачу'}</WBButton> : <WBButton variant="accent" disabled={disabled || !canCreate} onClick={() => void act(() => client.create(scope, { methodId, issueKind, summary: summary.trim(), description: jiraDescription(descriptionRu, descriptionEn, descriptionUz), ...(epic ? { epic } : {}), labels, ...(priorityId ? { priorityId } : {}), ...(confluenceUrl ? { confluenceUrl } : {}) }), true)}>{busy ? 'Создание…' : issueKind === 'task' ? 'Создать задачу' : 'Создать User Story'}</WBButton>}</footer>
        {!status.remembered && <p className="cf-muted">Включите сохранение Jira в локальной форме для защиты от повторного создания задач.</p>}
      </>}
    </>}
  </section>;
}
