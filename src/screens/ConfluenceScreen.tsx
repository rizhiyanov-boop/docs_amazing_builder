import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { WBButton, WBInput } from '../components/primitives/WorkbenchPrimitives';
import {
  CONFLUENCE_BRIDGE_URL, ConfluenceClientError, confluenceClient,
  confluenceContentText, confluenceOrigin, confluencePageIdFromLink, confluencePageUrl, type ConfluenceClient
} from '../confluenceClient';
import { renderConfluenceDocument } from '../confluenceDocument';
import type {
  ConfluenceBinding, ConfluenceCollection, ConfluenceDocument, ConfluencePage,
  ConfluencePageSummary, ConfluenceSpace, ConfluenceStatus
} from '../confluenceTypes';
import type { MethodDocument } from '../types';
import './ConfluenceScreen.css';

export type ConfluenceScreenProps = {
  method: MethodDocument;
  onPublished: (methodId: string, binding: ConfluenceBinding) => void;
  onBack: () => void;
  onBusyChange?: (busy: boolean) => void;
  client?: ConfluenceClient;
};
type Tab = 'publish' | 'browse';
type TreeLevel = ConfluenceCollection<ConfluencePageSummary> & { loading: boolean; error?: string };
type Prepared = {
  document: ConfluenceDocument; storage: string; methodId: string; mode: 'create' | 'update';
  baseUrl: string; title: string; spaceKey: string; sectionTitles: string[]; parent?: ConfluencePage; target?: ConfluencePage;
};
type Attempt = { operationId: string; prepared: Prepared };

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

function PageTree({ spaceKey, baseUrl, client, selectedId, onSelect }: {
  spaceKey: string; baseUrl: string; client: ConfluenceClient; selectedId?: string;
  onSelect: (page: ConfluencePageSummary) => void;
}): ReactNode {
  const [levels, setLevels] = useState<Record<string, TreeLevel>>({ root: { items: [], nextStart: null, loading: true } });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const lifetime = useRef({ active: true });
  useEffect(() => {
    const generation = { active: true };
    lifetime.current = generation;
    client.getTree(spaceKey, undefined, 0, baseUrl).then(result => {
      if (generation.active) setLevels({ root: { ...result, loading: false } });
    }).catch(error => {
      if (generation.active) setLevels({ root: { items: [], nextStart: null, loading: false, error: errorMessage(error) } });
    });
    return () => { generation.active = false; };
  }, [client, spaceKey, baseUrl]);

  async function load(parentId?: string, start = 0) {
    const key = parentId ?? 'root';
    const generation = lifetime.current;
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
    }
  }
  function toggle(page: ConfluencePageSummary) {
    const open = !expanded.has(page.id);
    setExpanded(old => { const next = new Set(old); if (open) next.add(page.id); else next.delete(page.id); return next; });
    if (open && !levels[page.id]) void load(page.id);
  }
  function renderLevel(parentId?: string, path: string[] = []): ReactNode {
    const level = levels[parentId ?? 'root'];
    if (!level) return null;
    return <ul className="cf-tree-level">
      {level.items.filter(page => !path.includes(page.id)).map(page => <li key={page.id}>
        <div className="cf-tree-row">
          <button type="button" className="cf-tree-toggle" aria-label={`${expanded.has(page.id) ? 'Свернуть' : 'Раскрыть'} ${page.title}`} aria-expanded={expanded.has(page.id)} onClick={() => toggle(page)}>{expanded.has(page.id) ? '▾' : '▸'}</button>
          <button type="button" className="cf-tree-select" aria-pressed={selectedId === page.id} onClick={() => onSelect(page)}>{page.title}</button>
        </div>
        {expanded.has(page.id) && renderLevel(page.id, [...path, page.id])}
      </li>)}
      {level.loading && <li className="cf-muted" role="status">Загрузка страниц…</li>}
      {level.error && <li><p className="cf-error" role="alert">{level.error}</p><WBButton size="sm" onClick={() => void load(parentId, level.nextStart ?? 0)}>Повторить загрузку</WBButton></li>}
      {!level.loading && !level.error && level.items.length === 0 && <li className="cf-muted">{parentId ? 'Дочерних страниц нет' : 'Доступных корневых страниц нет'}</li>}
      {level.nextStart !== null && !level.error && <li><WBButton size="sm" disabled={level.loading} onClick={() => void load(parentId, level.nextStart ?? 0)}>Загрузить ещё {parentId ? 'дочерние страницы' : 'корневые страницы'}</WBButton></li>}
    </ul>;
  }
  return <div className="cf-tree" aria-label="Дерево доступных страниц Confluence">{renderLevel()}</div>;
}

export function ConfluenceScreen({ method, onPublished, onBack, onBusyChange, client = confluenceClient }: ConfluenceScreenProps): ReactNode {
  const binding = method.confluence;
  const bindingBaseUrl = binding?.baseUrl;
  const bindingSpaceKey = binding?.spaceKey;
  const document = useMemo(() => renderConfluenceDocument(method), [method]);
  const [tab, setTab] = useState<Tab>('publish');
  const [status, setStatus] = useState<ConfluenceStatus | null>(null);
  const [connectionBusy, setConnectionBusy] = useState(true);
  const [spaces, setSpaces] = useState<ConfluenceCollection<ConfluenceSpace>>({ items: [], nextStart: null });
  const [spacesBusy, setSpacesBusy] = useState(false);
  const [spaceKey, setSpaceKey] = useState(binding?.spaceKey ?? '');
  const [browseSpaceKey, setBrowseSpaceKey] = useState(binding?.spaceKey ?? '');
  const [treeRevision, setTreeRevision] = useState(0);
  const [mode, setMode] = useState<'create' | 'update'>(binding ? 'update' : 'create');
  const [title, setTitle] = useState(method.name);
  const [parent, setParent] = useState<ConfluencePage>();
  const [rootChosen, setRootChosen] = useState(false);
  const [boundPage, setBoundPage] = useState<ConfluencePage>();
  const [browsePage, setBrowsePage] = useState<ConfluencePage>();
  const [pageBusy, setPageBusy] = useState(false);
  const [link, setLink] = useState('');
  const [prepared, setPrepared] = useState<Prepared>();
  const [preparing, setPreparing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ page: ConfluencePage; fingerprint: string; baseUrl: string }>();
  const [conflict, setConflict] = useState(false);
  const [unknown, setUnknown] = useState<Attempt>();
  const [checkingOperation, setCheckingOperation] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState('');
  const connectionSequence = useRef(0);
  const pageSequence = useRef(0);
  const preparationSequence = useRef(0);
  const currentOrigin = useRef('');
  const previousOrigin = useRef(binding?.baseUrl ?? '');
  const writeLock = useRef(false);
  const alive = useRef(true);
  const baseUrl = status?.baseUrl ?? '';
  const connected = status?.connected === true && Boolean(baseUrl);
  const bindingMatches = binding?.baseUrl === baseUrl;
  const unknownMatches = connected && unknown?.prepared.baseUrl === baseUrl;
  const busy = preparing || publishing || pageBusy;
  const activeSpaceKey = tab === 'browse' ? browseSpaceKey : spaceKey;
  const boundPageId = binding?.pageId;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onBusyChange?.(publishing || Boolean(unknown)); }, [onBusyChange, publishing, unknown]);
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
      if (changed) {
        pageSequence.current++; preparationSequence.current++;
        setParent(undefined); setRootChosen(false); setBoundPage(undefined); setBrowsePage(undefined);
        setPrepared(undefined); setResult(undefined); setConflict(false); setShowPreview(false);
        setPageBusy(false); setPreparing(false); setSpacesBusy(false); setLink(''); setRecoveryLink('');
        setSpaceKey(bindingBaseUrl === nextOrigin ? bindingSpaceKey ?? '' : '');
        setBrowseSpaceKey(bindingBaseUrl === nextOrigin ? bindingSpaceKey ?? '' : '');
        setSpaces({ items: [], nextStart: null }); setTreeRevision(old => old + 1);
      }
      if (nextOrigin) previousOrigin.current = nextOrigin;
      setStatus({ ...next, baseUrl: nextOrigin }); setError('');
      if (nextOrigin) {
        const list = await client.getSpaces(0, nextOrigin);
        if (!alive.current || sequence !== connectionSequence.current) return;
        setSpaces(list); setSpaceKey(old => old || list.items[0]?.key || '');
        setBrowseSpaceKey(old => old || list.items[0]?.key || '');
        setTreeRevision(old => old + 1);
      } else setSpaces({ items: [], nextStart: null });
    } catch (failure) {
      if (alive.current && sequence === connectionSequence.current) { currentOrigin.current = ''; setStatus(null); setSpaces({ items: [], nextStart: null }); reportError(failure); }
    } finally { if (alive.current && sequence === connectionSequence.current) setConnectionBusy(false); }
  }, [client, reportError, bindingBaseUrl, bindingSpaceKey]);
  useEffect(() => {
    void Promise.resolve().then(() => { if (alive.current) void refreshConnection(); });
  }, [refreshConnection]);
  useEffect(() => {
    if (!connected || !bindingMatches || !boundPageId || mode !== 'update') return;
    let active = true;
    client.getPage(boundPageId, baseUrl).then(page => { if (active && currentOrigin.current === baseUrl) setBoundPage(page); }).catch(failure => { if (active && currentOrigin.current === baseUrl) reportError(failure); });
    return () => { active = false; };
  }, [client, connected, bindingMatches, boundPageId, baseUrl, mode, reportError]);

  async function loadMoreSpaces() {
    if (!connected || spaces.nextStart === null) return;
    const origin = baseUrl;
    setSpacesBusy(true);
    try {
      const list = await client.getSpaces(spaces.nextStart, origin);
      if (!alive.current || currentOrigin.current !== origin) return;
      setSpaces(old => ({ ...list, items: [...new Map([...old.items, ...list.items].map(space => [space.key, space])).values()] }));
    } catch (failure) { if (alive.current && currentOrigin.current === origin) reportError(failure); }
    finally { if (alive.current && currentOrigin.current === origin) setSpacesBusy(false); }
  }
  async function selectPage(id: string, context = tab) {
    if (!connected) return;
    const origin = baseUrl;
    const sequence = ++pageSequence.current;
    setPageBusy(true); setError('');
    try {
      const page = await client.getPage(id, origin);
      if (!alive.current || sequence !== pageSequence.current || currentOrigin.current !== origin) return;
      if (context === 'browse') { setBrowsePage(page); setBrowseSpaceKey(page.spaceKey); }
      else { setParent(page); setRootChosen(false); setPrepared(undefined); setSpaceKey(page.spaceKey); }
    } catch (failure) { if (alive.current && sequence === pageSequence.current && currentOrigin.current === origin) reportError(failure); }
    finally { if (alive.current && sequence === pageSequence.current && currentOrigin.current === origin) setPageBusy(false); }
  }
  function changeSpace(value: string) {
    pageSequence.current++; setPageBusy(false);
    if (tab === 'browse') { setBrowsePage(undefined); setBrowseSpaceKey(value); }
    else { setSpaceKey(value); setParent(undefined); setRootChosen(false); setPrepared(undefined); }
  }
  function createNew() {
    setMode('create'); setPrepared(undefined); setResult(undefined); setConflict(false);
    setParent(undefined); setRootChosen(false); setError(''); setTab('publish');
  }
  async function preparePublication() {
    if (!connected || busy || unknown || !spaceKey) return;
    if (mode === 'update' && (!binding || !bindingMatches)) {
      reportError(new ConfluenceClientError('INVALID_TARGET', 'Страница связана с другим подключением. Подключите её Confluence или опубликуйте документ как новую страницу.'));
      return;
    }
    const origin = baseUrl;
    const sequence = ++preparationSequence.current;
    const active = () => alive.current && sequence === preparationSequence.current && currentOrigin.current === origin;
    setPreparing(true); setError(''); setConflict(false); setResult(undefined);
    const snapshot = document;
    try {
      const conversion = await client.prepare(snapshot.wiki, snapshot.diagrams, origin);
      if (!active()) return;
      const draft: Prepared = { document: snapshot, storage: conversion.storage, methodId: method.id, mode, baseUrl: origin, title: title.trim(), spaceKey, sectionTitles: method.sections.map(section => section.title) };
      if (mode === 'update') {
        if (!binding || binding.baseUrl !== status?.baseUrl) throw new ConfluenceClientError('INVALID_TARGET', 'Страница связана с другим подключением. Опубликуйте документ как новую страницу.');
        const page = await client.getPage(binding.pageId, origin);
        if (!active()) return;
        draft.target = page; draft.spaceKey = page.spaceKey; draft.title = page.title;
        setBoundPage(page);
        if (page.version !== binding.lastPublishedVersion) setConflict(true);
      } else if (parent) {
        draft.parent = await client.getPage(parent.id, origin);
        if (!active()) return;
        if (draft.parent.spaceKey !== spaceKey) throw new ConfluenceClientError('INVALID_TARGET', 'Родительская страница перемещена. Выберите место публикации заново.');
        setParent(draft.parent);
      } else if (!rootChosen) throw new ConfluenceClientError('INVALID_TARGET', 'Выберите родительскую страницу или создание в корне пространства.');
      setPrepared(draft); setShowPreview(false);
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
    setPrepared(undefined); setConflict(false); setBoundPage(page); setMode('update');
    onPublished(attempt.prepared.methodId, {
      baseUrl: attempt.prepared.baseUrl, spaceKey: page.spaceKey, pageId: page.id,
      lastPublishedVersion: page.version, publishedFingerprint: attempt.prepared.document.fingerprint,
      publishedAt: new Date().toISOString()
    });
  }
  async function publish() {
    if (!prepared || conflict || !connected || prepared.baseUrl !== baseUrl || unknown || writeLock.current) return;
    writeLock.current = true; setPublishing(true); setError('');
    const attempt: Attempt = { operationId: crypto.randomUUID(), prepared };
    try {
      if (prepared.target) {
        const latest = await client.getPage(prepared.target.id, prepared.baseUrl);
        if (!alive.current) return;
        if (currentOrigin.current !== prepared.baseUrl) throw new ConfluenceClientError('SESSION_CHANGED', 'Подключение изменилось. Подготовьте публикацию заново.');
        if (latest.version !== prepared.target.version) {
          setPrepared({ ...prepared, target: latest }); setBoundPage(latest); setConflict(true);
          return;
        }
      } else if (prepared.parent) {
        const latest = await client.getPage(prepared.parent.id, prepared.baseUrl);
        if (!alive.current) return;
        if (currentOrigin.current !== prepared.baseUrl) throw new ConfluenceClientError('SESSION_CHANGED', 'Подключение изменилось. Подготовьте публикацию заново.');
        if (latest.spaceKey !== prepared.spaceKey) throw new ConfluenceClientError('INVALID_TARGET', 'Родительская страница перемещена. Выберите место публикации заново.');
      }
      const page = await client.publish({
        operationId: attempt.operationId, baseUrl: prepared.baseUrl, mode: prepared.mode, title: prepared.title,
        spaceKey: prepared.spaceKey, storage: prepared.storage,
        ...(prepared.parent ? { parentId: prepared.parent.id } : {}),
        ...(prepared.target ? { pageId: prepared.target.id, expectedVersion: prepared.target.version } : {})
      });
      finish(page, attempt);
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ConfluenceClientError && ['OUTCOME_UNKNOWN', 'OPERATION_PENDING'].includes(failure.code)) setUnknown({ ...attempt, operationId: failure.operationId ?? attempt.operationId });
      else if (failure instanceof ConfluenceClientError && failure.code === 'VERSION_CONFLICT') setConflict(true);
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
      const page = await client.confirmOperation(unknown.operationId, pageId, unknown.prepared.baseUrl);
      finish(page, unknown);
    } catch (failure) { if (alive.current) reportError(failure); }
    finally { if (alive.current) setCheckingOperation(false); }
  }
  const shownPage = mode === 'update' ? prepared?.target ?? boundPage : prepared?.parent ?? parent;
  const newerChanges = result && result.fingerprint !== document.fingerprint;

  function treeControls() {
    return <section>
      <label className="cf-field">Пространство
        <select aria-label="Пространство" value={activeSpaceKey} disabled={busy || Boolean(unknown)} onChange={event => changeSpace(event.target.value)}>
          <option value="">Выберите пространство</option>
          {activeSpaceKey && !spaces.items.some(space => space.key === activeSpaceKey) && <option value={activeSpaceKey}>{activeSpaceKey}</option>}
          {spaces.items.map(space => <option key={space.key} value={space.key}>{space.name} · {space.key}</option>)}
        </select>
      </label>
      <div className="cf-actions">
        {spaces.nextStart !== null && <WBButton size="sm" disabled={spacesBusy} onClick={() => void loadMoreSpaces()}>Другие пространства</WBButton>}
        <WBButton size="sm" disabled={!activeSpaceKey || busy} onClick={() => setTreeRevision(old => old + 1)}>Обновить дерево</WBButton>
      </div>
      <p className="cf-muted">Раскройте раздел и выберите страницу. Загружаются только открытые ветви.</p>
      {connected && activeSpaceKey && <PageTree key={`${baseUrl}:${tab}:${activeSpaceKey}:${treeRevision}`} baseUrl={baseUrl} spaceKey={activeSpaceKey} client={client} selectedId={tab === 'browse' ? browsePage?.id : parent?.id} onSelect={page => void selectPage(page.id)} />}
      <details className="cf-link-entry"><summary>Перейти по ссылке на страницу</summary>
        <WBInput label="Ссылка Confluence" value={link} onChange={event => setLink(event.target.value)} />
        <WBButton size="sm" disabled={pageBusy || !link.trim()} onClick={() => {
          try { void selectPage(confluencePageIdFromLink(link, baseUrl)); } catch (failure) { reportError(failure); }
        }}>Открыть страницу</WBButton>
      </details>
    </section>;
  }

  return <section className="cf-screen" aria-label="Confluence">
    <header className="cf-header">
      <div><WBButton size="sm" onClick={onBack} disabled={publishing || Boolean(unknown)}>Назад в редактор</WBButton><h2>Confluence</h2><p className="cf-muted">{method.name}</p></div>
      <div className="cf-connection"><span role="status">{connectionBusy ? 'Проверка подключения…' : connected ? 'Локальное подключение активно' : 'Нет подключения'}</span>{status?.user && <span className="cf-muted">{status.user}</span>}
        {connected && <span className="cf-muted">{baseUrl}</span>}
        <a href={`${CONFLUENCE_BRIDGE_URL}/`} target="_blank" rel="noopener noreferrer">Открыть локальное подключение</a>
        <WBButton size="sm" disabled={connectionBusy} onClick={() => { setConnectionBusy(true); void refreshConnection(); }}>Проверить подключение</WBButton>
      </div>
    </header>
    <nav className="cf-tabs" aria-label="Действия Confluence">
      <WBButton aria-pressed={tab === 'publish'} disabled={publishing || Boolean(unknown)} onClick={() => { setTab('publish'); setTreeRevision(old => old + 1); }}>Публикация</WBButton>
      <WBButton aria-pressed={tab === 'browse'} disabled={busy || Boolean(unknown)} onClick={() => { setTab('browse'); setTreeRevision(old => old + 1); }}>Страницы</WBButton>
    </nav>
    {error && <p className="cf-notice cf-error" role="alert">{error}</p>}
    {!connected && !connectionBusy && <div className="cf-notice"><h3>Подключите Confluence</h3><p>Токен вводится в локальном приложении и передаётся только вашему Confluence. Проект сохраняется в DocBuilder как прежде.</p><p><a href="/docbuilder-confluence-local.zip" download>Скачать локальное приложение</a> · Распакуйте и запустите start-confluence.cmd.</p></div>}
    {connected && tab === 'browse' && <div className="cf-grid">{treeControls()}<section><h3>Просмотр страницы</h3>
      {pageBusy ? <p role="status">Чтение страницы…</p> : browsePage ? <><p className="cf-destination">{pagePath(browsePage)}</p><p className="cf-muted">Версия {browsePage.version}</p><a href={confluencePageUrl(browsePage.id, baseUrl)} target="_blank" rel="noopener noreferrer">Открыть в Confluence</a><pre className="cf-content">{confluenceContentText(browsePage.storage ?? '')}</pre><p className="cf-muted">Показан текст страницы. Диаграммы и макросы просматриваются в Confluence. Обратный импорт в редактируемый метод пока не реализован.</p></> : <p className="cf-muted">Выберите страницу в дереве. Просмотр не изменяет проект и место публикации.</p>}
    </section></div>}
    {tab === 'publish' && <>
      <p className="cf-publication-state">{result ? newerChanges ? 'Опубликован снимок документа · есть более новые изменения' : 'Опубликовано в Confluence' : binding ? binding.publishedFingerprint === document.fingerprint ? 'Последняя публикация соответствует документу' : 'Есть изменения в DocBuilder' : 'Метод ещё не опубликован'}</p>
      {unknown && <section className="cf-notice cf-error"><h3>Результат публикации не подтверждён</h3><p>Страница могла быть создана или обновлена. Сначала проверьте результат; повторная запись заблокирована. Не закрывайте этот экран до проверки.</p><p>Исходный Confluence: {unknown.prepared.baseUrl}</p>{!unknownMatches && <p>Подключите этот адрес в локальном приложении и проверьте подключение здесь. Проверка через другой Confluence заблокирована.</p>}<WBButton disabled={checkingOperation || !unknownMatches} onClick={() => void checkOperation()}>{checkingOperation ? 'Проверка результата…' : 'Проверить результат операции'}</WBButton>
        {(unknown.prepared.parent || unknown.prepared.target) && <p><a href={confluencePageUrl((unknown.prepared.target ?? unknown.prepared.parent)!.id, unknown.prepared.baseUrl)} target="_blank" rel="noopener noreferrer">Открыть место публикации в Confluence</a></p>}
        <p>Если страница появилась в Confluence, вставьте ссылку. Приложение проверит её содержимое и назначение перед сохранением привязки.</p><WBInput label="Ссылка на опубликованную страницу" value={recoveryLink} onChange={event => setRecoveryLink(event.target.value)} /><div className="cf-actions"><WBButton disabled={checkingOperation || !unknownMatches || !recoveryLink.trim()} onClick={() => void confirmPage()}>Проверить эту страницу</WBButton></div>
      </section>}
      {result && <section className="cf-notice"><h3>Страница {result.page.version === 1 ? 'создана' : 'обновлена'}</h3><p>{pagePath(result.page)} · версия {result.page.version}</p><a href={confluencePageUrl(result.page.id, result.baseUrl)} target="_blank" rel="noopener noreferrer">Открыть в Confluence</a><div className="cf-actions"><WBButton disabled={!connected || !bindingMatches} onClick={() => { setResult(undefined); void preparePublication(); }}>Подготовить обновление</WBButton><WBButton onClick={createNew}>Опубликовать как новую страницу</WBButton></div></section>}
      {!result && !prepared && !unknown && <>
        {binding && <div className="cf-actions"><WBButton aria-pressed={mode === 'update'} disabled={busy || !connected || !bindingMatches} onClick={() => setMode('update')}>Обновить привязанную страницу</WBButton><WBButton aria-pressed={mode === 'create'} disabled={busy} onClick={createNew}>Опубликовать как новую страницу</WBButton></div>}
        {mode === 'create' ? <div className="cf-grid">{connected ? treeControls() : <p className="cf-muted">После подключения здесь появится дерево пространств.</p>}<section><h3>Новая страница</h3><WBInput label="Заголовок страницы" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} />
          <p className="cf-destination">{baseUrl || 'Адрес Confluence не настроен'}<br />{parent ? pagePath(parent) : rootChosen ? `${spaceKey} / Корень пространства` : 'Родительская страница не выбрана'}<br /><strong>{title || 'Новая страница'}</strong></p>
          <WBButton size="sm" disabled={!connected || !spaceKey || busy} onClick={() => { setParent(undefined); setRootChosen(true); }}>Создать в корне пространства</WBButton><p className="cf-muted">Будет создана новая страница. Выбранный родитель сохраняет своё содержимое.</p>
        </section></div> : <section><h3>Обновление привязанной страницы</h3><p className="cf-destination">{binding?.baseUrl}<br />{!connected || !bindingMatches ? 'Подключите Confluence привязанной страницы или создайте отдельную страницу в текущем подключении.' : boundPage ? pagePath(boundPage) : 'Читаем актуальное название и путь…'}</p><p className="cf-notice">Документ DocBuilder заменит всё содержимое этой страницы. Версия проверяется перед записью.</p></section>}
        <footer className="cf-footer"><WBButton variant="accent" disabled={!connected || busy || (mode === 'update' && !bindingMatches) || (mode === 'create' && (!title.trim() || !spaceKey || (!parent && !rootChosen)))} onClick={() => void preparePublication()}>{preparing ? 'Проверяем публикацию…' : 'Проверить публикацию'}</WBButton></footer>
      </>}
      {prepared && !result && <section><h3>{prepared.mode === 'update' ? 'Проверка обновления' : 'Проверка новой страницы'}</h3><p className="cf-destination">{prepared.baseUrl}<br />{shownPage ? pagePath(shownPage) : `${prepared.spaceKey} / Корень пространства`}<br />{prepared.mode === 'create' && <strong>{prepared.title}</strong>}</p>
        {conflict ? <><div className="cf-notice cf-error" role="alert"><h3>Страницу изменили в Confluence</h3><p>Запись остановлена. Последняя публикация: версия {binding?.lastPublishedVersion ?? 'неизвестна'}; сейчас: {prepared.target?.version ?? 'новая версия'}.</p></div><div className="cf-grid"><section><h3>Сейчас в Confluence</h3><pre className="cf-content">{confluenceContentText(prepared.target?.storage ?? '')}</pre></section><section><h3>Подготовлено в DocBuilder</h3><pre className="cf-content">{confluenceContentText(prepared.storage)}</pre></section></div><div className="cf-actions">{binding && <a href={confluencePageUrl(binding.pageId, prepared.baseUrl)} target="_blank" rel="noopener noreferrer">Открыть страницу</a>}<WBButton onClick={createNew}>Создать отдельную страницу</WBButton></div></> : <>
          {prepared.mode === 'update' && <p className="cf-notice">Всё содержимое выбранной страницы будет заменено. Текущая версия {prepared.target?.version}; после обновления {prepared.target ? prepared.target.version + 1 : ''}.</p>}
          <ul className="cf-check-list">{prepared.sectionTitles.map((name, index) => <li key={index}>{name}</li>)}{prepared.document.diagrams.map((diagram, index) => <li key={diagram.placeholder}>Диаграмма {index + 1} · {diagram.engine === 'plantuml' ? 'PlantUML' : 'Mermaid'} · нативный макрос сформирован</li>)}</ul>
          <p className="cf-muted">Отрисовка плагинов проверяется на странице Confluence. Внешние сервисы изображений не используются.</p><WBButton onClick={() => setShowPreview(old => !old)}>{showPreview ? 'Скрыть предпросмотр' : 'Предпросмотр документа'}</WBButton>{showPreview && <pre className="cf-content">{confluenceContentText(prepared.storage)}</pre>}
          {document.fingerprint !== prepared.document.fingerprint && <p className="cf-notice">Документ изменился после проверки. Будет опубликован проверенный снимок; новые изменения останутся неопубликованными.</p>}
        </>}
        <footer className="cf-footer"><WBButton disabled={publishing || Boolean(unknown)} onClick={() => { setPrepared(undefined); setConflict(false); }}>Вернуться к назначению</WBButton><WBButton variant="accent" disabled={!connected || prepared.baseUrl !== baseUrl || publishing || conflict || Boolean(unknown)} onClick={() => void publish()}>{publishing ? 'Публикация…' : prepared.mode === 'update' ? 'Обновить страницу' : 'Создать страницу'}</WBButton></footer>
      </section>}
    </>}
  </section>;
}
