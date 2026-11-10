import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { WBButton, WBInput } from '../components/primitives/WorkbenchPrimitives';
import { ConfluenceSpacePicker } from '../components/ConfluenceSpacePicker';
import { ConfluenceContentPreview, ConfluencePagePreview } from '../components/ConfluencePagePreview';
import { ConfluencePageImport } from '../components/ConfluencePageImport';
import { JiraTaskWorkflow } from '../components/JiraTaskWorkflow';
import { jiraMethodContext } from '../jiraMethodContext';
import { isPersonalSpace, loadConfluenceSpaces, rememberSpace } from '../confluenceSpaces';
import {
  CONFLUENCE_BRIDGE_URL, ConfluenceClientError, confluenceClient,
  confluenceContentText, confluenceOrigin, confluencePageIdFromLink, confluencePageUrl, type ConfluenceClient
} from '../confluenceClient';
import { renderConfluenceDocument } from '../confluenceDocument';
import { importedPublicationSections, restoreConfluencePublication } from '../confluencePublicationStorage';
import { CONFLUENCE_VERSION_NOTE_LIMIT, suggestConfluenceVersionNote } from '../confluenceVersionNote';
import type {
  ConfluenceBinding, ConfluenceCollection, ConfluenceDocument, ConfluenceImportSource, ConfluencePage,
  ConfluencePageSummary, ConfluencePublishRequest, ConfluenceSpace, ConfluenceStatus
} from '../confluenceTypes';
import type { MethodDocument } from '../types';
import './ConfluenceScreen.css';

export type ConfluenceScreenProps = {
  method: MethodDocument;
  onPublished: (methodId: string, binding: ConfluenceBinding) => void;
  onJiraLinked?: (methodId: string, issueUrl: string) => void;
  onImportMethod?: (method: MethodDocument) => void;
  onOpenImported?: (source: ConfluenceImportSource) => boolean;
  onBack: () => void;
  onBusyChange?: (busy: boolean) => void;
  client?: ConfluenceClient;
};
type Tab = 'publish' | 'browse' | 'jira';
type TreeLevel = ConfluenceCollection<ConfluencePageSummary> & { loading: boolean; error?: string };
type Prepared = {
  document: ConfluenceDocument; storage: string; methodId: string; mode: 'create' | 'update';
  baseUrl: string; title: string; spaceKey: string; sectionTitles: string[]; parent?: ConfluencePage; target?: ConfluencePage; source?: ConfluencePage;
  versionNote?: { value: string; edited: boolean };
};
type Attempt = { operationId: string; prepared: Prepared };

function publicationRequest(attempt: Attempt): ConfluencePublishRequest {
  const { operationId, prepared } = attempt;
  const versionMessage = prepared.versionNote?.value.trim();
  return { operationId, baseUrl: prepared.baseUrl, mode: prepared.mode, title: prepared.title,
    spaceKey: prepared.spaceKey, storage: prepared.storage,
    ...(versionMessage ? { versionMessage } : {}),
    ...(prepared.parent ? { parentId: prepared.parent.id } : {}),
    ...(prepared.target ? { pageId: prepared.target.id, expectedVersion: prepared.target.version } : {}) };
}

function withReviewedPage(draft: Prepared, page: ConfluencePage, migration: boolean): Prepared {
  return {
    ...draft,
    target: page,
    spaceKey: page.spaceKey,
    versionNote: draft.versionNote && !draft.versionNote.edited
      ? { value: suggestConfluenceVersionNote(page, draft, migration), edited: false }
      : draft.versionNote
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ConfluenceClientError) {
    if (['NOT_CONNECTED', 'AUTH_EXPIRED', 'SESSION_REQUIRED'].includes(error.code)) return 'Войдите в Confluence через локальное приложение и проверьте подключение.';
    if (error.code === 'NOT_FOUND') return 'Страница недоступна. Проверьте ссылку и права доступа.';
    if (error.code === 'ACCESS_DENIED') return 'Недостаточно прав для этого действия в выбранном разделе.';
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить действие. Повторите проверку подключения.';
}
function pagePath(page: ConfluencePage): string {
  return [page.spaceKey, ...page.ancestors.map(a => a.title), page.title].join(' / ');
}

type NavigationState = { spaces: Map<string, string>; branches: Map<string, Set<string>> };
const navigationStates = new WeakMap<ConfluenceClient, NavigationState>();
function navigationState(client: ConfluenceClient): NavigationState {
  let state = navigationStates.get(client);
  if (!state) { state = { spaces: new Map(), branches: new Map() }; navigationStates.set(client, state); }
  return state;
}

function PageTree({ spaceKey, baseUrl, client, selectedId, revealPage, onSelect }: {
  spaceKey: string; baseUrl: string; client: ConfluenceClient; selectedId?: string;
  revealPage?: ConfluencePage;
  onSelect: (page: ConfluencePageSummary) => void;
}): ReactNode {
  const [levels, setLevels] = useState<Record<string, TreeLevel>>({ root: { items: [], nextStart: null, loading: true } });
  const treeKey = `${baseUrl}/${spaceKey}`;
  const rememberedBranches = navigationState(client).branches;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rememberedBranches.get(treeKey)));
  const lifetime = useRef({ active: true, pending: new Set<string>() });
  const treeElement = useRef<HTMLDivElement>(null);
  const selectedElement = useRef<HTMLButtonElement>(null);
  const scrolledPage = useRef<ConfluencePage | undefined>(undefined);
  useEffect(() => {
    const generation = { active: true, pending: new Set<string>() };
    lifetime.current = generation;
    client.getTree(spaceKey, undefined, 0, baseUrl).then(result => {
      if (generation.active) setLevels({ root: { ...result, loading: false } });
    }).catch(error => {
      if (generation.active) setLevels({ root: { items: [], nextStart: null, loading: false, error: errorMessage(error) } });
    });
    return () => { generation.active = false; };
  }, [client, spaceKey, baseUrl]);

  const load = useCallback(async (parentId?: string, start = 0) => {
    const key = parentId ?? 'root';
    const generation = lifetime.current;
    if (!generation.active || generation.pending.has(key)) return;
    generation.pending.add(key);
    setLevels(old => ({ ...old, [key]: { ...(old[key] ?? { items: [], nextStart: null }), loading: true, error: undefined } }));
    try {
      const result = await client.getTree(spaceKey, parentId, start, baseUrl);
      if (!generation.active) return;
      setLevels(old => {
        const items = start === 0 ? result.items : [...(old[key]?.items ?? []), ...result.items];
        return { ...old, [key]: { ...result, items: [...new Map(items.map(page => [page.id, page])).values()], loading: false } };
      });
    } catch (error) {
      if (generation.active) setLevels(old => ({ ...old, [key]: { ...(old[key] ?? { items: [], nextStart: null }), loading: false, error: errorMessage(error) } }));
    } finally { generation.pending.delete(key); }
  }, [client, spaceKey, baseUrl]);
  function toggle(page: ConfluencePageSummary) {
    const open = !expanded.has(page.id);
    setExpanded(old => { const next = new Set(old); if (open) next.add(page.id); else next.delete(page.id); rememberedBranches.set(treeKey, next); return next; });
    if (open && !levels[page.id]) void load(page.id);
  }
  useEffect(() => {
    for (const level of Object.values(levels)) {
      for (const page of level.items) if (expanded.has(page.id) && !levels[page.id]) void load(page.id);
    }
    // Fetch remembered branches only as their parents become available.
  }, [levels, expanded, load]);
  useEffect(() => {
    if (!revealPage) return;
    scrolledPage.current = undefined;
    setExpanded(old => {
      const next = new Set(old);
      for (const ancestor of revealPage.ancestors) next.add(ancestor.id);
      rememberedBranches.set(treeKey, next);
      return next;
    });
  }, [revealPage, rememberedBranches, treeKey]);
  useEffect(() => {
    if (!revealPage) return;
    let parentId: string | undefined;
    for (const page of [...revealPage.ancestors, revealPage]) {
      const level = levels[parentId ?? 'root'];
      if (!level || level.loading || level.error) return;
      if (!level.items.some(item => item.id === page.id)) {
        if (level.nextStart !== null) void load(parentId, level.nextStart);
        return;
      }
      parentId = page.id;
    }
  }, [revealPage, levels, load]);
  useEffect(() => {
    const tree = treeElement.current;
    const selected = selectedElement.current;
    if (!revealPage || !tree || !selected || scrolledPage.current === revealPage) return;
    const viewport = tree.getBoundingClientRect();
    const row = selected.getBoundingClientRect();
    if (row.top < viewport.top) tree.scrollTop += row.top - viewport.top;
    else if (row.bottom > viewport.bottom) tree.scrollTop += row.bottom - viewport.bottom;
    scrolledPage.current = revealPage;
  }, [revealPage, levels, expanded]);
  function renderLevel(parentId?: string, path: string[] = []): ReactNode {
    const level = levels[parentId ?? 'root'];
    if (!level) return null;
    return <ul className="cf-tree-level">
      {level.items.filter(page => !path.includes(page.id)).map(page => <li key={page.id}>
        <div className="cf-tree-row">
          <button type="button" className="cf-tree-toggle" aria-label={`${expanded.has(page.id) ? 'Свернуть' : 'Раскрыть'} ${page.title}`} aria-expanded={expanded.has(page.id)} onClick={() => toggle(page)}>{expanded.has(page.id) ? '▾' : '▸'}</button>
          <button ref={selectedId === page.id ? selectedElement : undefined} type="button" className="cf-tree-select" aria-pressed={selectedId === page.id} onClick={() => onSelect(page)}>{page.title}</button>
        </div>
        {expanded.has(page.id) && renderLevel(page.id, [...path, page.id])}
      </li>)}
      {level.loading && <li className="cf-muted" role="status">Загрузка страниц…</li>}
      {level.error && <li><p className="cf-error" role="alert">{level.error}</p><WBButton size="sm" onClick={() => void load(parentId, level.nextStart ?? 0)}>Повторить загрузку</WBButton></li>}
      {!level.loading && !level.error && level.items.length === 0 && <li className="cf-muted">{parentId ? 'Дочерних страниц нет' : 'Доступных корневых страниц нет'}</li>}
      {level.nextStart !== null && !level.error && <li><WBButton size="sm" disabled={level.loading} onClick={() => void load(parentId, level.nextStart ?? 0)}>Загрузить ещё {parentId ? 'дочерние страницы' : 'корневые страницы'}</WBButton></li>}
    </ul>;
  }
  return <div ref={treeElement} className="cf-tree" aria-label="Дерево доступных страниц Confluence">{renderLevel()}</div>;
}

export function ConfluenceScreen({ method, onPublished, onJiraLinked, onImportMethod, onOpenImported, onBack, onBusyChange, client = confluenceClient }: ConfluenceScreenProps): ReactNode {
  const binding = method.confluence;
  const importedTarget = binding ? undefined : method.confluenceImport;
  const target = binding ?? importedTarget;
  const targetVersion = binding?.lastPublishedVersion ?? importedTarget?.version;
  const rememberedSpaces = navigationState(client).spaces;
  const targetBaseUrl = target?.baseUrl;
  const bindingSpaceKey = binding?.spaceKey;
  const document = useMemo(() => renderConfluenceDocument(method), [method]);
  const [tab, setTab] = useState<Tab>('publish');
  const [jiraVisited, setJiraVisited] = useState(false);
  const [status, setStatus] = useState<ConfluenceStatus | null>(null);
  const [connectionBusy, setConnectionBusy] = useState(true);
  const [checkFeedback, setCheckFeedback] = useState<'success' | 'error' | null>(null);
  const handleCheckConnection = async () => {
    setConnectionBusy(true);
    setCheckFeedback(null);
    try {
      await refreshConnection();
      setCheckFeedback('success');
      window.setTimeout(() => setCheckFeedback(null), 3000);
    } catch {
      setCheckFeedback('error');
      window.setTimeout(() => setCheckFeedback(null), 3000);
    }
  };
  const [spaces, setSpaces] = useState<ConfluenceCollection<ConfluenceSpace>>({ items: [], nextStart: null });
  const [spacesBusy, setSpacesBusy] = useState(false);
  const [spaceKey, setSpaceKey] = useState(binding?.spaceKey ?? '');
  const [browseSpaceKey, setBrowseSpaceKey] = useState(binding?.spaceKey ?? '');
  const [treeRevision, setTreeRevision] = useState(0);
  const [mode, setMode] = useState<'create' | 'update'>(target ? 'update' : 'create');
  const [title, setTitle] = useState(method.name);
  const [updateTitle, setUpdateTitle] = useState<string>();
  const [parent, setParent] = useState<ConfluencePage>();
  const [boundPage, setBoundPage] = useState<ConfluencePage>();
  const [boundPageBusy, setBoundPageBusy] = useState(false);
  const [browsePage, setBrowsePage] = useState<ConfluencePage>();
  const [pageBusy, setPageBusy] = useState(false);
  const [link, setLink] = useState('');
  const [revealTarget, setRevealTarget] = useState<{ tab: Tab; page: ConfluencePage }>();
  const [prepared, setPrepared] = useState<Prepared>();
  const [preparing, setPreparing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [jiraBusy, setJiraBusy] = useState(false);
  const [result, setResult] = useState<{ page: ConfluencePage; fingerprint: string; baseUrl: string }>();
  const [conflict, setConflict] = useState(false);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);
  const [unknown, setUnknown] = useState<Attempt>();
  const [checkingOperation, setCheckingOperation] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState('');
  const connectionSequence = useRef(0);
  const pageSequence = useRef(0);
  const boundPageSequence = useRef({ value: 0 });
  const preparationSequence = useRef(0);
  const currentOrigin = useRef('');
  const previousOrigin = useRef(targetBaseUrl ?? '');
  const writeLock = useRef(false);
  const alive = useRef(true);
  const baseUrl = status?.baseUrl ?? '';
  const connected = status?.connected === true && Boolean(baseUrl);
  const supportsVersionComments = status?.versionComments === true;
  const targetMatches = targetBaseUrl === baseUrl;
  const unknownMatches = connected && unknown?.prepared.baseUrl === baseUrl;
  const busy = preparing || publishing || pageBusy || boundPageBusy || jiraBusy;
  const activeSpaceKey = tab === 'browse' ? browseSpaceKey : spaceKey;
  const boundPageId = target?.pageId;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onBusyChange?.(preparing || publishing || jiraBusy || Boolean(unknown)); }, [onBusyChange, preparing, publishing, jiraBusy, unknown]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const reportError = useCallback((failure: unknown) => {
    setError(errorMessage(failure));
    if (failure instanceof ConfluenceClientError && ['NOT_CONNECTED', 'AUTH_EXPIRED', 'SESSION_REQUIRED'].includes(failure.code)) setStatus(old => old ? { ...old, connected: false } : old);
  }, []);
  const refreshConnection = useCallback(async () => {
    const sequence = ++connectionSequence.current;
    try {
      const next = await client.getStatus();
      if (!alive.current || sequence !== connectionSequence.current) return;
      const nextOrigin = next.connected ? confluenceOrigin(next.baseUrl) : '';
      const changed = Boolean(nextOrigin && previousOrigin.current && nextOrigin !== previousOrigin.current);
      currentOrigin.current = nextOrigin;
      if (!nextOrigin) { boundPageSequence.current.value++; setBoundPageBusy(false); }
      if (changed) {
        pageSequence.current++; boundPageSequence.current.value++; preparationSequence.current++;
        setParent(undefined); setBoundPage(undefined); setBrowsePage(undefined); setRevealTarget(undefined);
        setPrepared(undefined); setResult(undefined); setConflict(false); setOverwriteConfirmed(false); setShowPreview(false); setUpdateTitle(undefined); setBoundPageBusy(false);
        setPageBusy(false); setPreparing(false); setSpacesBusy(false); setLink(''); setRecoveryLink('');
        setSpaceKey(targetBaseUrl === nextOrigin ? bindingSpaceKey ?? '' : '');
        setBrowseSpaceKey(targetBaseUrl === nextOrigin ? bindingSpaceKey ?? '' : '');
        setSpaces({ items: [], nextStart: null }); setTreeRevision(old => old + 1);
      }
      if (nextOrigin) previousOrigin.current = nextOrigin;
      setStatus({ ...next, baseUrl: nextOrigin }); setError('');
      if (nextOrigin) {
        setSpacesBusy(true);
        const items = await loadConfluenceSpaces(client, nextOrigin, () => alive.current && sequence === connectionSequence.current);
        if (!alive.current || sequence !== connectionSequence.current) return;
        const firstGlobalKey = items.find(space => !isPersonalSpace(space))?.key ?? '';
        const restore = (context: Tab, previous: string) => {
          const remembered = rememberedSpaces.get(`${nextOrigin}/${context}`);
          return items.some(space => space.key === previous) ? previous : items.some(space => space.key === remembered) ? remembered! : firstGlobalKey;
        };
        setSpaces({ items, nextStart: null }); setSpaceKey(old => restore('publish', changed ? '' : old));
        setBrowseSpaceKey(old => restore('browse', changed ? '' : old));
        setTreeRevision(old => old + 1);
      } else setSpaces({ items: [], nextStart: null });
    } catch (failure) {
      if (alive.current && sequence === connectionSequence.current) { currentOrigin.current = ''; boundPageSequence.current.value++; setBoundPageBusy(false); setStatus(null); setSpaces({ items: [], nextStart: null }); reportError(failure); }
    } finally { if (alive.current && sequence === connectionSequence.current) { setConnectionBusy(false); setSpacesBusy(false); } }
  }, [client, reportError, targetBaseUrl, bindingSpaceKey, rememberedSpaces]);
  useEffect(() => {
    void Promise.resolve().then(() => { if (alive.current) void refreshConnection(); });
  }, [refreshConnection]);
  useEffect(() => {
    if (connected && activeSpaceKey && spaces.items.some(space => space.key === activeSpaceKey)) rememberedSpaces.set(`${baseUrl}/${tab}`, activeSpaceKey);
  }, [connected, baseUrl, activeSpaceKey, spaces, tab, rememberedSpaces]);
  useEffect(() => {
    const handleFocus = () => {
      if (alive.current && !busy) void refreshConnection();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [busy, refreshConnection]);

  useEffect(() => {
    let active = true;
    let pending = false;
    const interval = window.setInterval(async () => {
      if (pending || busy || unknown) return;
      pending = true;
      try {
        const next = await client.getStatus();
        if (!active) return;
        const origin = next.connected ? confluenceOrigin(next.baseUrl) : '';
        if (origin !== baseUrl || next.connected !== connected) await refreshConnection();
        else setStatus({ ...next, baseUrl: origin });
      } catch {
        if (active) { currentOrigin.current = ''; setStatus(null); }
      } finally { pending = false; }
    }, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [client, baseUrl, connected, busy, unknown, refreshConnection]);
  const refreshBoundPage = useCallback(async () => {
    if (!connected || !targetMatches || !boundPageId || mode !== 'update') return;
    const counter = boundPageSequence.current;
    const sequence = ++counter.value;
    const active = () => alive.current && sequence === counter.value && currentOrigin.current === baseUrl;
    setBoundPageBusy(true); setError('');
    try {
      const page = await client.getPage(boundPageId, baseUrl);
      if (active()) { setBoundPage(page); setUpdateTitle(old => old ?? page.title); }
    } catch (failure) { if (active()) reportError(failure); }
    finally { if (active()) setBoundPageBusy(false); }
  }, [client, connected, targetMatches, boundPageId, baseUrl, mode, reportError]);
  useEffect(() => {
    const counter = boundPageSequence.current;
    let active = true;
    void Promise.resolve().then(() => { if (active) void refreshBoundPage(); });
    return () => { active = false; counter.value++; };
  }, [refreshBoundPage, targetVersion]);

  async function selectPage(id: string, context = tab, reveal = false) {
    if (!connected) return;
    const origin = baseUrl;
    const sequence = ++pageSequence.current;
    setPageBusy(true); setError('');
    if (context === 'publish') { setParent(undefined); setPrepared(undefined); }
    try {
      const page = await client.getPage(id, origin);
      if (!alive.current || sequence !== pageSequence.current || currentOrigin.current !== origin) return;
      rememberSpace(origin, page.spaceKey);
      setRevealTarget(reveal ? { tab: context, page: { ...page } } : undefined);
      if (context === 'browse') { setBrowsePage(page); setBrowseSpaceKey(page.spaceKey); }
      else { setParent(page); setPrepared(undefined); setSpaceKey(page.spaceKey); }
    } catch (failure) { if (alive.current && sequence === pageSequence.current && currentOrigin.current === origin) reportError(failure); }
    finally { if (alive.current && sequence === pageSequence.current && currentOrigin.current === origin) setPageBusy(false); }
  }
  function changeSpace(value: string) {
    pageSequence.current++; setPageBusy(false); setRevealTarget(undefined);
    if (tab === 'browse') { setBrowsePage(undefined); setBrowseSpaceKey(value); }
    else { setSpaceKey(value); setParent(undefined); setPrepared(undefined); }
  }
  function createNew() {
    setMode('create'); setPrepared(undefined); setResult(undefined); setConflict(false); setOverwriteConfirmed(false);
    setParent(undefined); setRevealTarget(undefined); setError(''); setTab('publish');
  }
  async function preparePublication() {
    if (!connected || busy || unknown || mode === 'create' && (!spaceKey || !title.trim()) || mode === 'update' && !updateTitle?.trim()) return;
    if (mode === 'update' && (!target || !targetMatches)) {
      reportError(new ConfluenceClientError('INVALID_TARGET', 'Страница связана с другим подключением. Подключите её Confluence или опубликуйте документ как новую страницу.'));
      return;
    }
    const origin = baseUrl;
    const sequence = ++preparationSequence.current;
    const active = () => alive.current && sequence === preparationSequence.current && currentOrigin.current === origin;
    setPreparing(true); setError(''); setConflict(false); setOverwriteConfirmed(false); setResult(undefined);
    const snapshot = document;
    try {
      const conversion = await client.prepare(snapshot.wiki, snapshot.diagrams, origin);
      if (!active()) return;
      const draft: Prepared = { document: snapshot, storage: conversion.storage, methodId: method.id, mode, baseUrl: origin, title: title.trim(), spaceKey, sectionTitles: method.sections.map(section => section.title) };
      const source = method.confluenceImport;
      if (source && importedPublicationSections(method).length) {
        if (source.baseUrl !== origin) throw new Error('Для переноса материалов исходной страницы подключите её Confluence.');
        const current = await client.getPage(source.pageId, origin);
        if (!active()) return;
        draft.source = current.version === source.version ? current : await client.getPage(source.pageId, origin, source.version);
        if (!active()) return;
        draft.storage = restoreConfluencePublication(method, conversion.storage, draft.source, mode === 'update' ? target?.pageId : undefined);
      }
      if (mode === 'update') {
        if (!target || target.baseUrl !== origin) throw new ConfluenceClientError('INVALID_TARGET', 'Страница связана с другим подключением. Опубликуйте документ как новую страницу.');
        const page = await client.getPage(target.pageId, origin);
        if (!active()) return;
        draft.title = updateTitle!.trim();
        if (supportsVersionComments) draft.versionNote = { value: '', edited: false };
        const reviewed = withReviewedPage(draft, page, Boolean(importedTarget));
        setBoundPage(page);
        const changed = page.version !== targetVersion;
        if (changed || method.confluenceImport || reviewed.versionNote) {
          setConflict(changed); setShowPreview(false); setPrepared(reviewed); return;
        }
        await publish(reviewed);
        return;
      } else if (parent) {
        draft.parent = await client.getPage(parent.id, origin);
        if (!active()) return;
        if (draft.parent.spaceKey !== spaceKey) throw new ConfluenceClientError('INVALID_TARGET', 'Родительская страница перемещена. Выберите место публикации заново.');
        setParent(draft.parent);
      } else throw new ConfluenceClientError('INVALID_TARGET', 'Выберите родительскую страницу в дереве.');
      setShowPreview(false);
      if (method.confluenceImport) { setPrepared(draft); return; }
      await publish(draft);
    } catch (failure) { if (active()) reportError(failure); }
    finally { if (alive.current && sequence === preparationSequence.current) setPreparing(false); }
  }
  function finish(page: ConfluencePage, attempt: Attempt) {
    if (!alive.current) return;
    if (currentOrigin.current !== attempt.prepared.baseUrl) {
      setUnknown(attempt); setError('Подключение изменилось. Подключите исходный Confluence и проверьте результат операции.');
      return;
    }
    setResult({ page, fingerprint: attempt.prepared.document.fingerprint, baseUrl: attempt.prepared.baseUrl }); setUnknown(undefined);
    setPrepared(undefined); setConflict(false); setOverwriteConfirmed(false); setBoundPage(page); setUpdateTitle(page.title); setMode('update');
    onPublished(attempt.prepared.methodId, {
      baseUrl: attempt.prepared.baseUrl, spaceKey: page.spaceKey, pageId: page.id,
      lastPublishedVersion: page.version, publishedFingerprint: attempt.prepared.document.fingerprint,
      publishedAt: new Date().toISOString()
    });
  }
  async function publish(draft: Prepared | undefined = prepared) {
    const publication = draft;
    if (!publication || (conflict || publication.mode === 'update' && importedTarget) && !overwriteConfirmed
      || !connected || publication.baseUrl !== baseUrl || unknown || writeLock.current) return;
    if (publication.versionNote?.value.trim() && !supportsVersionComments) {
      setError('Переподключите локальное приложение с поддержкой комментариев к версии.');
      return;
    }
    const prepared = publication;
    writeLock.current = true; setPublishing(true); setError('');
    const attempt: Attempt = { operationId: crypto.randomUUID(), prepared };
    try {
      if (prepared.target) {
        const latest = await client.getPage(prepared.target.id, prepared.baseUrl);
        if (!alive.current) return;
        if (currentOrigin.current !== prepared.baseUrl) throw new ConfluenceClientError('SESSION_CHANGED', 'Подключение изменилось. Подготовьте публикацию заново.');
        if (latest.version !== prepared.target.version) {
          setPrepared(withReviewedPage(prepared, latest, Boolean(importedTarget))); setBoundPage(latest); setConflict(true); setOverwriteConfirmed(false);
          return;
        }
      } else if (prepared.parent) {
        const latest = await client.getPage(prepared.parent.id, prepared.baseUrl);
        if (!alive.current) return;
        if (currentOrigin.current !== prepared.baseUrl) throw new ConfluenceClientError('SESSION_CHANGED', 'Подключение изменилось. Подготовьте публикацию заново.');
        if (latest.spaceKey !== prepared.spaceKey) throw new ConfluenceClientError('INVALID_TARGET', 'Родительская страница перемещена. Выберите место публикации заново.');
      }
      const page = await client.publish(publicationRequest(attempt));
      finish(page, attempt);
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ConfluenceClientError && ['OUTCOME_UNKNOWN', 'OPERATION_PENDING'].includes(failure.code)) setUnknown({ ...attempt, operationId: failure.operationId ?? attempt.operationId });
      else if (failure instanceof ConfluenceClientError && failure.code === 'VERSION_CONFLICT' && prepared.target) {
        setPrepared(prepared); setConflict(true); setOverwriteConfirmed(false);
        // The bridge or Confluence can reject a race after the last browser read.
        // Review that new version before allowing another explicit replacement.
        try {
          const latest = await client.getPage(prepared.target.id, prepared.baseUrl);
          if (!alive.current || currentOrigin.current !== prepared.baseUrl) return;
          setPrepared(withReviewedPage(prepared, latest, Boolean(importedTarget))); setBoundPage(latest);
        } catch { /* The next write still re-reads and checks the reviewed version. */ }
      }
      reportError(failure);
    } finally { writeLock.current = false; if (alive.current) setPublishing(false); }
  }
  async function checkOperation() {
    if (!unknown || checkingOperation || !unknownMatches) return;
    setCheckingOperation(true); setError('');
    try {
      const operation = await client.getOperation(unknown.operationId, unknown.prepared.baseUrl);
      if (!alive.current || currentOrigin.current !== unknown.prepared.baseUrl) return;
      if (operation.state === 'success' && operation.page) finish(operation.page, unknown);
      else if (operation.state === 'failed') { setUnknown(undefined); setError(operation.message || 'Публикация не выполнена. Можно подготовить документ заново.'); }
      else setError('Результат ещё не подтверждён. Новая публикация заблокирована; проверьте результат позже.');
    } catch (failure) { if (alive.current && currentOrigin.current === unknown.prepared.baseUrl) reportError(failure); }
    finally { if (alive.current) setCheckingOperation(false); }
  }
  async function confirmPage() {
    if (!unknown || checkingOperation || !unknownMatches) return;
    setCheckingOperation(true); setError('');
    try {
      const pageId = confluencePageIdFromLink(recoveryLink, unknown.prepared.baseUrl);
      const page = await client.confirmOperation(unknown.operationId, pageId, unknown.prepared.baseUrl, publicationRequest(unknown));
      finish(page, unknown);
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ConfluenceClientError && failure.code === 'VERIFICATION_MISMATCH') {
        try {
          const actual = await client.getPage(confluencePageIdFromLink(recoveryLink, unknown.prepared.baseUrl), unknown.prepared.baseUrl);
          if (!alive.current || currentOrigin.current !== unknown.prepared.baseUrl) return;
          const expected = unknown.prepared;
          const differences: string[] = [];
          if (actual.title !== expected.title) differences.push(`Название: ожидалось «${expected.title}», получено «${actual.title}».`);
          if (actual.spaceKey !== expected.spaceKey) differences.push(`Пространство: ожидалось ${expected.spaceKey}, получено ${actual.spaceKey}.`);
          const version = expected.target ? expected.target.version + 1 : 1;
          if (actual.version !== version) differences.push(`Версия: ожидалась ${version}, получена ${actual.version}.`);
          if (expected.target && actual.id !== expected.target.id) differences.push('Идентификатор страницы отличается.');
          if (!expected.target && (actual.parentId ?? null) !== (expected.parent?.id ?? null)) differences.push(`Родитель: ожидался ${expected.parent?.id ?? 'корень'}, получен ${actual.parentId ?? 'корень'}.`);
          const normalize = (value: string) => value.replace(/\r\n?/g, '\n').replace(/<!\[CDATA\[[\s\S]*?\]\]>|<ac:structured-macro\b[^>]*>|&nbsp;/g, tag => tag.startsWith('<![CDATA[') ? tag : tag.replace(/\s+ac:macro-id="[^"]*"/g, '').replace(/&nbsp;/g, '\u00a0')).trim();
          const sent = normalize(expected.storage);
          const received = normalize(actual.storage ?? '');
          if (sent !== received) {
            let offset = 0;
            while (offset < Math.min(sent.length, received.length) && sent[offset] === received[offset]) offset++;
            differences.push(`Содержимое отличается с позиции ${offset}. Отправлено: ${sent.slice(Math.max(0, offset - 60), offset + 180)}. Сохранено: ${received.slice(Math.max(0, offset - 60), offset + 180)}.`);
          }
          setError(differences.length ? differences.join(' ') : 'Метаданные и содержимое совпадают. Требуется проверка журнала локального сервиса.');
        } catch (diagnosticFailure) { reportError(diagnosticFailure); }
      } else reportError(failure);
    }
    finally { if (alive.current) setCheckingOperation(false); }
  }
  const shownPage = mode === 'update' ? prepared?.target ?? boundPage : prepared?.parent ?? parent;
  const newerChanges = result && (result.fingerprint !== document.fingerprint || updateTitle?.trim() !== result.page.title);
  const remoteChanged = boundPage && target && boundPage.version !== targetVersion;
  const updateHasChanges = importedTarget || binding && (binding.publishedFingerprint !== document.fingerprint || updateTitle?.trim() !== boundPage?.title || remoteChanged);
  const reviewRequired = conflict || prepared?.mode === 'update' && Boolean(importedTarget);
  const versionLabel = importedTarget ? 'Импортированная версия' : 'Последняя публикация';

  function treeControls() {
    return <section>
      <ConfluenceSpacePicker key={baseUrl} spaces={spaces.items} value={activeSpaceKey} origin={baseUrl} loading={spacesBusy} disabled={busy || Boolean(unknown) || spacesBusy} onChange={changeSpace} />
      <div className="cf-actions">
        <WBButton size="sm" disabled={!activeSpaceKey || busy} onClick={() => setTreeRevision(old => old + 1)}>Обновить дерево</WBButton>
      </div>
      <p className="cf-muted">Раскройте раздел и выберите страницу. Загружаются только открытые ветви.</p>
      {connected && activeSpaceKey && <PageTree key={`${baseUrl}:${tab}:${activeSpaceKey}:${treeRevision}`} baseUrl={baseUrl} spaceKey={activeSpaceKey} client={client} selectedId={tab === 'browse' ? browsePage?.id : parent?.id} revealPage={revealTarget?.tab === tab && revealTarget.page.spaceKey === activeSpaceKey ? revealTarget.page : undefined} onSelect={page => void selectPage(page.id)} />}
      <details className="cf-link-entry"><summary>Перейти по ссылке на страницу</summary>
        <WBInput label="Ссылка Confluence" value={link} onChange={event => setLink(event.target.value)} />
        <WBButton size="sm" disabled={pageBusy || !link.trim()} onClick={() => {
          try { void selectPage(confluencePageIdFromLink(link, baseUrl), tab, true); } catch (failure) { reportError(failure); }
        }}>Открыть страницу</WBButton>
      </details>
    </section>;
  }

  return <section className="cf-screen" aria-label="Confluence">
    <header className="cf-header">
      <div><button type="button" className="cf-back" aria-label="Назад в редактор" title="Назад в редактор" onClick={onBack} disabled={preparing || publishing || jiraBusy || Boolean(unknown)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg></button><h2>Confluence & Jira</h2></div>
      <div className="cf-connection">
        <span
          className={`cf-status-badge ${connected ? 'is-connected' : 'is-disconnected'}`}
          role="status"
          aria-label={connectionBusy ? 'Проверка подключения' : connected ? 'Локальное подключение активно' : 'Нет подключения'}
          title={connectionBusy ? 'Проверка подключения…' : connected ? 'Confluence подключен' : status === null ? 'Локальный мост не запущен' : 'Confluence не подключен'}
        >
          <span className="cf-status-dot" aria-hidden="true" />
          <span className="cf-status-label">{connectionBusy ? 'Проверка…' : connected ? 'Confluence' : status === null ? 'Мост отключен' : 'Confluence не подключен'}</span>
        </span>
        {status?.user && <span className="cf-status-user">{status.user}</span>}
        {connected && <span className="cf-muted">{baseUrl}</span>}
        {!connected && !connectionBusy && (
          <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer" className="cf-confluence-bridge-link">
            Открыть локальное подключение
          </a>
        )}
        <WBButton
          size="sm"
          variant="ghost"
          aria-label="Проверить подключение"
          title={connectionBusy ? 'Проверка подключения…' : checkFeedback === 'success' ? 'Подключение активно' : checkFeedback === 'error' ? 'Ошибка проверки' : 'Проверить подключение'}
          className={`cf-connection-refresh-btn ${checkFeedback ? `is-${checkFeedback}` : ''}`}
          disabled={connectionBusy}
          onClick={() => void handleCheckConnection()}
        >
          {checkFeedback === 'success' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M21 21v-5h-5" /></svg>
          )}
        </WBButton>
      </div>
    </header>
    <nav className="cf-tabs" aria-label="Действия Confluence">
      <WBButton aria-pressed={tab === 'publish'} disabled={preparing || publishing || jiraBusy || Boolean(unknown)} onClick={() => { setTab('publish'); setTreeRevision(old => old + 1); }}>Публикация</WBButton>
      <WBButton aria-pressed={tab === 'browse'} disabled={busy || Boolean(unknown)} onClick={() => { setTab('browse'); setTreeRevision(old => old + 1); }}>Страницы</WBButton>
      <WBButton aria-pressed={tab === 'jira'} disabled={busy || Boolean(unknown)} onClick={() => { setJiraVisited(true); setTab('jira'); }}>Jira</WBButton>
    </nav>
    {jiraVisited && <div hidden={tab !== 'jira'}><JiraTaskWorkflow key={method.id} active={tab === 'jira'} methodId={method.id} methodName={method.name} methodContext={jiraMethodContext(method)} jiraTicket={method.jiraTicket} confluenceUrl={binding ? confluencePageUrl(binding.pageId, binding.baseUrl) : undefined} onBusyChange={setJiraBusy} onLinked={onJiraLinked} /></div>}
    {error && <p className="cf-notice cf-error" role="alert">{error}</p>}
    {!connected && !connectionBusy && tab !== 'jira' && <div className="cf-notice"><h3>Подключите Confluence</h3><p>Токен вводится в локальном приложении и передаётся только вашему Confluence. Проект сохраняется в DocBuilder как прежде.</p><p><a href="/docbuilder-confluence-local.zip" download>Скачать локальное приложение</a> · Распакуйте и запустите start-confluence.cmd.</p></div>}
    {connected && tab === 'browse' && <div className="cf-grid">{treeControls()}<section><h3>Просмотр страницы</h3>
      {pageBusy ? <p role="status">Чтение страницы…</p> : browsePage ? <>
        <p className="cf-destination">{pagePath(browsePage)}</p>
        <p className="cf-muted">Версия {browsePage.version}</p>
        <a href={confluencePageUrl(browsePage.id, baseUrl)} target="_blank" rel="noopener noreferrer">Открыть в Confluence</a>
        {onImportMethod && <ConfluencePageImport key={baseUrl + '/' + browsePage.id + '/' + browsePage.version}
          page={browsePage} baseUrl={baseUrl} onOpenExisting={onOpenImported} onImport={onImportMethod} />}
        <pre className="cf-content">{confluenceContentText(browsePage.storage ?? '')}</pre>
      </> : <p className="cf-muted">Выберите страницу в дереве. Просмотр не изменяет проект и место публикации.</p>}
    </section></div>}
    {tab === 'publish' && <>
      <p className="cf-publication-state">{result ? newerChanges ? 'Опубликован снимок документа · есть более новые изменения' : 'Опубликовано в Confluence' : binding ? binding.publishedFingerprint !== document.fingerprint || updateTitle !== undefined && boundPage && updateTitle.trim() !== boundPage.title ? 'Есть изменения в DocBuilder' : 'Последняя публикация соответствует документу' : importedTarget ? `Импортировано из Confluence · версия ${importedTarget.version}` : 'Метод ещё не опубликован'}</p>
      {unknown && <section className="cf-notice cf-error"><h3>Результат публикации не подтверждён</h3><p>Страница могла быть создана или обновлена. Сначала проверьте результат; повторная запись заблокирована. Не закрывайте этот экран до проверки.</p><p>Исходный Confluence: {unknown.prepared.baseUrl}</p>{!unknownMatches && <p>Подключите этот адрес в локальном приложении и проверьте подключение здесь. Проверка через другой Confluence заблокирована.</p>}<WBButton disabled={checkingOperation || !unknownMatches} onClick={() => void checkOperation()}>{checkingOperation ? 'Проверка результата…' : 'Проверить результат операции'}</WBButton>
        {(unknown.prepared.parent || unknown.prepared.target) && <p><a href={confluencePageUrl((unknown.prepared.target ?? unknown.prepared.parent)!.id, unknown.prepared.baseUrl)} target="_blank" rel="noopener noreferrer">Открыть место публикации в Confluence</a></p>}
        <p>Если страница появилась в Confluence, вставьте ссылку. Приложение проверит её содержимое и назначение перед сохранением привязки.</p><WBInput label="Ссылка на опубликованную страницу" value={recoveryLink} onChange={event => setRecoveryLink(event.target.value)} /><div className="cf-actions"><WBButton disabled={checkingOperation || !unknownMatches || !recoveryLink.trim()} onClick={() => void confirmPage()}>Проверить эту страницу</WBButton></div>
      </section>}
      {result && <section className="cf-notice"><h3>Страница {result.page.version === 1 ? 'создана' : 'обновлена'}</h3><p>{pagePath(result.page)} · версия {result.page.version}</p><a href={confluencePageUrl(result.page.id, result.baseUrl)} target="_blank" rel="noopener noreferrer">Открыть в Confluence</a></section>}
      {!prepared && !unknown && <>
        {target && <div className="cf-actions"><WBButton aria-pressed={mode === 'update'} disabled={busy || !connected || !targetMatches} onClick={() => setMode('update')}>{importedTarget ? 'Обновить исходную страницу' : 'Обновить привязанную страницу'}</WBButton><WBButton aria-pressed={mode === 'create'} disabled={busy} onClick={createNew}>Опубликовать как новую страницу</WBButton></div>}
        {mode === 'create' ? <div className="cf-grid">{connected ? treeControls() : <p className="cf-muted">После подключения здесь появится дерево пространств.</p>}<section><h3>Новая страница</h3><WBInput label="Заголовок страницы" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} />
          <p className="cf-muted">{parent ? `Новая страница будет создана внутри: ${parent.title}` : 'Выберите родительскую страницу в дереве. Её содержимое останется без изменений.'}</p>
          <ConfluencePagePreview page={parent} baseUrl={baseUrl} connected={connected} loading={pageBusy} />
        </section></div> : <div className="cf-grid"><section>
          <h3>{importedTarget ? 'Обновление исходной страницы' : 'Обновление текущей страницы'}</h3>
          <p className="cf-destination">{targetBaseUrl}<br />{!connected || !targetMatches ? 'Подключите Confluence привязанной страницы или создайте отдельную страницу в текущем подключении.' : boundPage ? pagePath(boundPage) : 'Читаем актуальное название и путь…'}</p>
          <WBInput label="Заголовок страницы" value={updateTitle ?? ''} maxLength={255} disabled={busy || !connected || !targetMatches || !boundPage} onChange={event => setUpdateTitle(event.target.value)} />
          <p className="cf-muted">Измените документ в редакторе DocBuilder и обновите эту страницу. Ссылка и место в дереве сохранятся.</p>
          <p className="cf-notice">Документ DocBuilder заменит всё содержимое этой страницы. Версия проверяется перед записью.</p>
          {connected && status?.bridgeVersion && !supportsVersionComments && <p className="cf-muted">Для комментариев к версии <a href="/docbuilder-confluence-local.zip" download>обновите локальное приложение</a>.</p>}
          {remoteChanged && <p className="cf-notice">В Confluence появилась версия {boundPage.version}. {versionLabel}: {targetVersion}. Перед заменой потребуется подтверждение.</p>}
          {connected && targetMatches && <div className="cf-actions"><WBButton size="sm" disabled={busy} onClick={() => void refreshBoundPage()}>{boundPageBusy ? 'Чтение страницы…' : 'Обновить просмотр'}</WBButton></div>}
          {boundPage && !busy && !updateHasChanges && <p className="cf-muted">Изменений для публикации нет.</p>}
        </section><ConfluencePagePreview page={boundPage} baseUrl={baseUrl} connected={connected && targetMatches} loading={boundPageBusy} updating /></div>}
        <footer className="cf-footer"><WBButton variant="accent" disabled={!connected || busy || (mode === 'update' && (!targetMatches || !boundPage || !updateTitle?.trim() || !updateHasChanges)) || (mode === 'create' && (!title.trim() || !spaceKey || !parent))} onClick={() => void preparePublication()}>{publishing ? 'Публикация…' : preparing ? 'Подготовка…' : mode === 'update' ? method.confluenceImport || supportsVersionComments ? 'Подготовить обновление' : 'Обновить страницу' : method.confluenceImport ? 'Подготовить публикацию' : 'Опубликовать'}</WBButton></footer>
      </>}
      {prepared && !result && !unknown && <section><h3>{prepared.mode === 'update' ? 'Проверка обновления' : 'Проверка новой страницы'}</h3><p className="cf-destination">{prepared.baseUrl}<br />{shownPage ? pagePath(shownPage) : `${prepared.spaceKey} / Корень пространства`}<br /><strong>{prepared.title}</strong></p>
        {prepared.versionNote && <div className="cf-version-note">
          <WBInput label="Комментарий к версии" value={prepared.versionNote.value} placeholder="Опубликовано из DocBuilder"
            maxLength={CONFLUENCE_VERSION_NOTE_LIMIT} disabled={publishing || jiraBusy || !supportsVersionComments}
            aria-describedby="cf-version-note-help" onChange={event => {
              const value = event.target.value;
              setPrepared(current => current ? { ...current, versionNote: { value, edited: true } } : current);
            }} />
          <p id="cf-version-note-help" className="cf-muted">{conflict && prepared.versionNote.edited
            ? 'Проверьте комментарий с учётом новой версии страницы.'
            : 'Комментарий появится в истории страницы Confluence.'}</p>
        </div>}
        {reviewRequired ? <><div className={conflict ? 'cf-notice cf-error' : 'cf-notice'} role={conflict ? 'alert' : undefined}>
          <h3>{conflict ? 'Страницу изменили в Confluence' : 'Первое обновление после импорта'}</h3>
          {conflict && <p>Запись остановлена. {versionLabel}: {targetVersion ?? 'неизвестна'}. Сейчас: версия {prepared.target?.version ?? 'неизвестна'}.</p>}
          <p>Документ из DocBuilder заменит заголовок и всё содержимое страницы. Проверьте, перенеслись ли нужные разделы, макросы и ссылки на вложения.</p>
        </div><div className="cf-grid"><section><h3>Сейчас в Confluence</h3><ConfluenceContentPreview storage={prepared.target?.storage ?? ''} baseUrl={prepared.baseUrl} /></section><section><h3>Подготовлено в DocBuilder</h3><ConfluenceContentPreview storage={prepared.storage} baseUrl={prepared.baseUrl} /></section></div><div className="cf-actions">{prepared.target && <a href={confluencePageUrl(prepared.target.id, prepared.baseUrl)} target="_blank" rel="noopener noreferrer">Открыть страницу</a>}<WBButton disabled={publishing || jiraBusy} onClick={createNew}>Создать отдельную страницу</WBButton></div>
          <label className="cf-overwrite-confirm"><input type="checkbox" checked={overwriteConfirmed} disabled={publishing || jiraBusy} onChange={event => setOverwriteConfirmed(event.target.checked)} /><span>Я проверил версию {prepared.target?.version} и подтверждаю замену заголовка и содержимого страницы.</span></label>
        </> : method.confluenceImport ? <>
          {prepared.mode === 'update' && <p className="cf-notice">Всё содержимое страницы будет заменено. Текущая версия {prepared.target?.version}.</p>}
          <div className={prepared.target || prepared.source ? 'cf-grid' : undefined}>
            {(prepared.target || prepared.source) && <section><h3>{prepared.target ? 'Сейчас в Confluence' : 'Исходная страница'}</h3><ConfluenceContentPreview storage={(prepared.target || prepared.source)?.storage ?? ''} baseUrl={prepared.baseUrl} /></section>}
            <section><h3>Подготовлено в DocBuilder</h3><ConfluenceContentPreview storage={prepared.storage} baseUrl={prepared.baseUrl} /></section>
          </div>
          <p className="cf-muted">Интерактивные макросы отображаются в Confluence.</p>
        </> : <>
          {prepared.mode === 'update' && <p className="cf-notice">Всё содержимое выбранной страницы будет заменено. Текущая версия {prepared.target?.version}; после обновления {prepared.target ? prepared.target.version + 1 : ''}.</p>}
          <ul className="cf-check-list">{prepared.sectionTitles.map((name, index) => <li key={index}>{name}</li>)}{prepared.document.diagrams.map((diagram, index) => <li key={diagram.placeholder}>Диаграмма {index + 1} · {diagram.engine === 'plantuml' ? 'PlantUML' : 'Mermaid'} · нативный макрос сформирован</li>)}</ul>
          <p className="cf-muted">Отрисовка плагинов проверяется на странице Confluence. Внешние сервисы изображений не используются.</p><WBButton onClick={() => setShowPreview(old => !old)}>{showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр документа'}</WBButton>{showPreview && <pre className="cf-content">{confluenceContentText(prepared.storage)}</pre>}
        </>}
        {document.fingerprint !== prepared.document.fingerprint && <p className="cf-notice">Документ изменился после проверки. Будет опубликован проверенный снимок; новые изменения останутся неопубликованными.</p>}
        <footer className="cf-footer"><WBButton disabled={publishing || jiraBusy || Boolean(unknown)} onClick={() => { setPrepared(undefined); setConflict(false); setOverwriteConfirmed(false); }}>Вернуться к назначению</WBButton><WBButton variant="accent" disabled={!connected || prepared.baseUrl !== baseUrl || publishing || jiraBusy || reviewRequired && !overwriteConfirmed || Boolean(unknown)} onClick={() => void publish()}>{publishing ? 'Публикация…' : reviewRequired ? 'Заменить содержимое' : prepared.mode === 'update' ? 'Обновить страницу' : 'Создать страницу'}</WBButton></footer>
      </section>}
    </>}
  </section>;
}
