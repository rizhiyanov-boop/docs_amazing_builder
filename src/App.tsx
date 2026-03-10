import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { parseToRows } from './parsers';
import { renderHtmlDocument } from './renderHtml';
import { renderWikiDocument } from './renderWiki';
import { DEFAULT_SECTION_TITLE, resolveSectionTitle, sanitizeSections } from './sectionTitles';
import { applyThemeToRoot } from './theme';
import type { ThemeName } from './theme';
import type { DocSection, ParsedSection, ParseFormat, ProjectData } from './types';

const STORAGE_KEY = 'doc-builder-project-v2';

type TabKey = 'editor' | 'html' | 'wiki' | 'split';
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

type AutosaveInfo = { state: AutosaveState; at?: string };

type TableValidation = Map<string, string>;

function createInitialSections(): DocSection[] {
  return [
    { id: 'goal', title: 'Цель', enabled: true, kind: 'text', value: '', required: true },
    { id: 'external-url', title: 'Внешний URL', enabled: true, kind: 'text', value: '' },
    { id: 'request', title: 'Request (cURL)', enabled: true, kind: 'parsed', format: 'curl', input: '', rows: [], error: '' },
    { id: 'body', title: 'Body / Выходные параметры', enabled: true, kind: 'parsed', format: 'json', input: '', rows: [], error: '' },
    { id: 'errors', title: 'Ошибки', enabled: true, kind: 'text', value: '' },
    { id: 'non-functional', title: 'Нефункциональные требования', enabled: true, kind: 'text', value: '' },
    { id: 'future', title: 'Доработки, планирующиеся на следующих этапах', enabled: false, kind: 'text', value: '' }
  ];
}

function validateSection(section: DocSection): string {
  if (section.kind !== 'parsed') return '';
  if (!section.input || !section.input.trim()) return 'Введите исходные данные для парсинга';
  if (section.error) return `Секция заблокирована: ${section.error}`;
  if (section.rows.length === 0) return 'Нет распарсенных строк';
  return '';
}

function asProjectData(sections: DocSection[]): ProjectData {
  return { version: 2, updatedAt: new Date().toISOString(), sections: sanitizeSections(sections) };
}

function loadProject(): DocSection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialSections();
    const parsed = JSON.parse(raw) as ProjectData;
    if (!parsed.sections || !Array.isArray(parsed.sections)) return createInitialSections();
    return sanitizeSections(parsed.sections);
  } catch {
    return createInitialSections();
  }
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function reorderSections(list: DocSection[], fromId: string, toId: string): DocSection[] {
  if (fromId === toId) return list;
  const next = [...list];
  const fromIndex = next.findIndex((s) => s.id === fromId);
  const toIndex = next.findIndex((s) => s.id === toId);
  if (fromIndex === -1 || toIndex === -1) return list;
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [sections, setSections] = useState<DocSection[]>(() => loadProject());
  const [selectedId, setSelectedId] = useState<string>(() => createInitialSections()[0].id);
  const [tab, setTab] = useState<TabKey>('editor');
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [autosave, setAutosave] = useState<AutosaveInfo>({ state: 'idle' });
  const [importError, setImportError] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (!sections.find((s) => s.id === selectedId) && sections[0]) {
      setSelectedId(sections[0].id);
    }
  }, [sections, selectedId]);

  const validationMap: TableValidation = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) map.set(section.id, validateSection(section));
    return map;
  }, [sections]);

  const selectedSection = sections.find((s) => s.id === selectedId) ?? sections[0];

  const htmlOutput = useMemo(() => renderHtmlDocument(sections, theme), [sections, theme]);
  const wikiOutput = useMemo(() => renderWikiDocument(sections), [sections]);

  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  useEffect(() => {
    setAutosave({ state: 'saving' });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(asProjectData(sections)));
      setAutosave({ state: 'saved', at: formatTime(new Date()) });
    } catch {
      setAutosave({ state: 'error' });
    }
  }, [sections]);

  function updateSection(id: string, updater: (section: DocSection) => DocSection): void {
    setSections((prev) => prev.map((section) => (section.id === id ? updater(section) : section)));
  }

  function updateSectionTitle(id: string, title: string): void {
    updateSection(id, (section) => ({ ...section, title }));
  }

  function runParser(section: ParsedSection): void {
    try {
      const rows = parseToRows(section.format, section.input);
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        return { ...current, rows, error: '' };
      });
    } catch (error) {
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        return {
          ...current,
          rows: [],
          error: error instanceof Error ? error.message : 'Ошибка парсинга'
        };
      });
    }
  }

  function exportProjectJson(): void {
    downloadText('doc-project.json', JSON.stringify(asProjectData(sections), null, 2));
  }

  function importProjectJson(file: File | undefined): void {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const parsed = JSON.parse(text) as ProjectData;
        if (!parsed.sections || !Array.isArray(parsed.sections)) throw new Error('Неверный формат');
        const sanitizedSections = sanitizeSections(parsed.sections);
        setSections(sanitizedSections);
        setSelectedId(sanitizedSections[0]?.id ?? selectedId);
        setImportError('');
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Ошибка импорта');
      }
    };
    reader.readAsText(file);
  }

  function resetProject(): void {
    if (!confirm('Сбросить проект? Все несохраненные данные будут потеряны.')) return;
    const seed = createInitialSections();
    setSections(seed);
    setSelectedId(seed[0].id);
    localStorage.removeItem(STORAGE_KEY);
  }

  function renderParsedTable(section: ParsedSection) {
    if (section.rows.length === 0) return <div className="muted">Нет распарсенных строк</div>;
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Поле</th>
              <th>Тип</th>
              <th>Обязательность</th>
              <th>Описание</th>
              <th>Пример</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r, i) => (
              <tr key={`${r.field}-${i}`}>
                <td>{r.field}</td>
                <td className="mono">{r.type}</td>
                <td>{r.required}</td>
                <td>{r.description || '—'}</td>
                <td className="mono">{r.example || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            API
          </span>
          <div>
            <h1>Doc Builder</h1>
          </div>
        </div>
        <div className="actions">
          <button className="ghost" onClick={resetProject}>Новый</button>
          <label className="ghost file-input" aria-label="Импортировать проект JSON">
            Импорт
            <input type="file" accept="application/json" onChange={(e) => importProjectJson(e.target.files?.[0])} />
          </label>
          <button className="ghost" onClick={exportProjectJson}>Экспорт JSON</button>
          <button onClick={() => downloadText('documentation.html', htmlOutput)}>Экспорт HTML</button>
          <button onClick={() => downloadText('documentation.wiki', wikiOutput)}>Экспорт Wiki</button>
          <button className="ghost" onClick={toggleTheme}>
            {theme === 'dark' ? 'Светлая' : 'Тёмная'} тема
          </button>
          <div className={`badge ${autosave.state}`} aria-live="polite">
            {autosave.state === 'saving' && 'Сохранение...'}
            {autosave.state === 'saved' && `Сохранено в ${autosave.at ?? ''}`}
            {autosave.state === 'error' && 'Ошибка сохранения'}
            {autosave.state === 'idle' && 'Готово'}
          </div>
        </div>
      </header>

      {importError && <div className="alert error">Ошибка импорта: {importError}</div>}

      <div className="layout">
        <aside className="sidebar" role="listbox" aria-label="Секции">
          <div className="sidebar-head">
            <div className="muted">Секции</div>
            <button
              className="ghost small"
              onClick={() => setSections((prev) => [...prev, { id: `custom-${Date.now()}`, title: DEFAULT_SECTION_TITLE, enabled: true, kind: 'text', value: '' }])}
            >
              + Добавить
            </button>
          </div>
          <div className="section-list">
            {sections.map((section) => {
              const error = validationMap.get(section.id);
              return (
                <button
                  key={section.id}
                  role="option"
                  aria-selected={selectedSection?.id === section.id}
                  className={`section-item ${selectedSection?.id === section.id ? 'active' : ''} ${error ? 'warn' : ''} ${!section.enabled ? 'disabled' : ''}`}
                  draggable
                  onDragStart={() => setDraggingId(section.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingId) setSections((prev) => reorderSections(prev, draggingId, section.id));
                    setDraggingId(null);
                  }}
                  onClick={() => setSelectedId(section.id)}
                >
                  <div className="section-title">{resolveSectionTitle(section.title)}</div>
                  <div className="chips">
                    {section.kind === 'parsed' && <span className="chip">{section.format.toUpperCase()}</span>}
                    {!section.enabled && <span className="chip muted">off</span>}
                    {error && <span className="chip danger">err</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="workspace" role="main">
          <div className="tabs" role="tablist" aria-label="Просмотр">
            {['editor', 'html', 'wiki', 'split'].map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? 'tab active' : 'tab'}
                onClick={() => setTab(key as TabKey)}
              >
                {key === 'editor' && 'Редактор'}
                {key === 'html' && 'HTML'}
                {key === 'wiki' && 'Wiki'}
                {key === 'split' && 'Split'}
              </button>
            ))}
          </div>

          {selectedSection ? (
            <div className={`panes ${tab === 'split' ? 'split' : ''}`}>
              {(tab === 'editor' || tab === 'split') && (
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <div className="panel-title">{resolveSectionTitle(selectedSection.title)}</div>
                      <div className="panel-sub">ID: {selectedSection.id}</div>
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={selectedSection.enabled}
                        onChange={(e) => updateSection(selectedSection.id, (curr) => ({ ...curr, enabled: e.target.checked }))}
                      />
                      <span>Активна</span>
                    </label>
                  </div>

                  <label className="field">
                    <div className="label">Название блока</div>
                    <input
                      type="text"
                      value={selectedSection.title}
                      onChange={(e) => updateSectionTitle(selectedSection.id, e.target.value)}
                      onBlur={(e) => updateSectionTitle(selectedSection.id, resolveSectionTitle(e.target.value))}
                      placeholder={DEFAULT_SECTION_TITLE}
                    />
                  </label>

                  {selectedSection.kind === 'text' && (
                    <div className="stack">
                      <label className="field">
                        <div className="label">Содержимое</div>
                        <textarea
                          rows={10}
                          value={selectedSection.value}
                          onChange={(e) => updateSection(selectedSection.id, (curr) => (curr.kind === 'text' ? { ...curr, value: e.target.value } : curr))}
                          placeholder="Опишите цель, ограничения, ошибки и т.д."
                        />
                      </label>
                    </div>
                  )}

                  {selectedSection.kind === 'parsed' && (
                    <div className="stack">
                      <div className="row gap">
                        <label className="field">
                          <div className="label">Формат</div>
                          <select
                            value={selectedSection.format}
                            onChange={(e) =>
                              updateSection(selectedSection.id, (curr) =>
                                curr.kind === 'parsed' ? { ...curr, format: e.target.value as ParseFormat, rows: [], error: '' } : curr
                              )
                            }
                          >
                            <option value="json">JSON</option>
                            <option value="xml">XML</option>
                            <option value="curl">cURL</option>
                          </select>
                        </label>
                        <button className="primary" onClick={() => runParser(selectedSection)}>Парсить</button>
                      </div>

                      <label className="field">
                        <div className="label">Исходные данные</div>
                        <textarea
                          rows={12}
                          value={selectedSection.input}
                          onChange={(e) =>
                            updateSection(selectedSection.id, (curr) =>
                              curr.kind === 'parsed' ? { ...curr, input: e.target.value, error: '' } : curr
                            )
                          }
                          placeholder="Вставьте JSON, XML или cURL"
                        />
                      </label>

                      {selectedSection.error && <div className="alert error">{selectedSection.error}</div>}
                      {!selectedSection.error && validationMap.get(selectedSection.id) === '' && selectedSection.rows.length > 0 && (
                        <div className="alert success">Распарсено {selectedSection.rows.length} строк</div>
                      )}

                      {renderParsedTable(selectedSection)}
                    </div>
                  )}
                </section>
              )}

              {(tab === 'html' || tab === 'split') && (
                <section className="panel">
                  <div className="panel-head">
                    <div className="panel-title">Предпросмотр HTML</div>
                    <button className="ghost small" onClick={() => downloadText('documentation.html', htmlOutput)}>
                      Скачать
                    </button>
                  </div>
                  <iframe
                    className="preview-frame"
                    title="HTML preview"
                    sandbox="allow-same-origin"
                    srcDoc={htmlOutput}
                  />
                </section>
              )}

              {(tab === 'wiki' || tab === 'split') && (
                <section className="panel">
                  <div className="panel-head">
                    <div className="panel-title">Предпросмотр Wiki</div>
                    <button className="ghost small" onClick={() => downloadText('documentation.wiki', wikiOutput)}>
                      Скачать
                    </button>
                  </div>
                  <textarea className="code" readOnly value={wikiOutput} rows={tab === 'split' ? 14 : 24} />
                </section>
              )}
            </div>
          ) : (
            <div className="muted">Секция не выбрана</div>
          )}
        </main>
      </div>
    </div>
  );
}
