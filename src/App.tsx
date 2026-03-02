
              {section.kind === 'parsed' && (
                <div className="parsed-box">
                  <div className="parsed-controls">
                    <select
                      value={section.format}
                      onChange={(event) =>
                        import { useEffect, useMemo, useState } from 'react';
                        import './App.css';
                        import { parseToRows } from './parsers';
                        import { renderHtmlDocument } from './renderHtml';
                        import { renderWikiDocument } from './renderWiki';
                        import type { DocSection, ParsedSection, ParseFormat, ProjectData } from './types';

                        const STORAGE_KEY = 'doc-builder-project-v2';

                        type TabKey = 'editor' | 'html' | 'wiki' | 'split';
                        type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

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
                          return { version: 2, updatedAt: new Date().toISOString(), sections };
                        }

                        function loadProject(): DocSection[] {
                          try {
                            const raw = localStorage.getItem(STORAGE_KEY);
                            if (!raw) return createInitialSections();
                            const parsed = JSON.parse(raw) as ProjectData;
                            if (!parsed.sections || !Array.isArray(parsed.sections)) return createInitialSections();
                            return parsed.sections;
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
                          const [theme, setTheme] = useState<'light' | 'dark'>('dark');
                          const [autosave, setAutosave] = useState<{ state: AutosaveState; at?: string }>({ state: 'idle' });
                          const [importError, setImportError] = useState('');
                          const [draggingId, setDraggingId] = useState<string | null>(null);

                          useEffect(() => {
                            if (!sections.find((s) => s.id === selectedId) && sections[0]) {
                              setSelectedId(sections[0].id);
                            }
                          }, [sections, selectedId]);

                          const validationMap = useMemo(() => {
                            const map = new Map<string, string>();
                            for (const section of sections) map.set(section.id, validateSection(section));
                            return map;
                          }, [sections]);

                          const selectedSection = sections.find((s) => s.id === selectedId) ?? sections[0];

                          const htmlOutput = useMemo(() => renderHtmlDocument(sections), [sections]);
                          const wikiOutput = useMemo(() => renderWikiDocument(sections), [sections]);

                          useEffect(() => {
                            document.documentElement.dataset.theme = theme;
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
                                setSections(parsed.sections);
                                setSelectedId(parsed.sections[0]?.id ?? selectedId);
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

                          return (
                            <div className="shell">
                              <header className="topbar">
                                <div className="brand">
                                  <span className="logo" aria-hidden>
                                    API
                                  </span>
                                  <div>
                                    <div className="title">Doc Builder</div>
                                    <div className="subtitle">Модернизированный интерфейс</div>
                                  </div>
                                </div>
                                <div className="actions">
                                  <button className="ghost" onClick={resetProject}>Новый</button>
                                  <label className="ghost file-input">
                                    Импорт
                                    <input type="file" accept="application/json" onChange={(e) => importProjectJson(e.target.files?.[0])} />
                                  </label>
                                  <button className="ghost" onClick={exportProjectJson}>Экспорт JSON</button>
                                  <button onClick={() => downloadText('documentation.html', htmlOutput)}>Экспорт HTML</button>
                                  <button onClick={() => downloadText('documentation.wiki', wikiOutput)}>Экспорт Wiki</button>
                                  <button className="ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                                    {theme === 'dark' ? 'Светлая' : 'Тёмная'} тема
                                  </button>
                                  <div className={`badge ${autosave.state}`}>
                                    {autosave.state === 'saving' && 'Сохранение...'}
                                    {autosave.state === 'saved' && `Сохранено в ${autosave.at ?? ''}`}
                                    {autosave.state === 'error' && 'Ошибка сохранения'}
                                    {autosave.state === 'idle' && 'Готово'}
                                  </div>
                                </div>
                              </header>

                              {importError && <div className="alert error">Ошибка импорта: {importError}</div>}

                              <div className="layout">
                                <aside className="sidebar">
                                  <div className="sidebar-head">
                                    <div className="muted">Секции</div>
                                    <button className="ghost small" onClick={() => setSections((prev) => [...prev, { id: `custom-${Date.now()}`, title: 'Новая секция', enabled: true, kind: 'text', value: '' }])}>
                                      + Добавить
                                    </button>
                                  </div>
                                  <div className="section-list">
                                    {sections.map((section) => {
                                      const error = validationMap.get(section.id);
                                      return (
                                        <div
                                          key={section.id}
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
                                          <div className="section-title">{section.title}</div>
                                          <div className="chips">
                                            {section.kind === 'parsed' && <span className="chip">{section.format.toUpperCase()}</span>}
                                            {!section.enabled && <span className="chip muted">off</span>}
                                            {error && <span className="chip danger">err</span>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </aside>

                                <main className="workspace">
                                  <div className="tabs">
                                    {['editor', 'html', 'wiki', 'split'].map((key) => (
                                      <button
                                        key={key}
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
                                              <div className="panel-title">{selectedSection.title}</div>
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
                                                        curr.kind === 'parsed'
                                                          ? { ...curr, format: e.target.value as ParseFormat, rows: [], error: '' }
                                                          : curr
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
                                          <div className="preview-frame" dangerouslySetInnerHTML={{ __html: htmlOutput }} />
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
              else return undefined;
          return cur;
        }
      }
    }
    return undefined;
  };

  return (
    <div className="table-wrap">
      <table ref={tableRef}>
        <colgroup>
          <col />
          <col />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>
              Поле
              <div className="resizer" />
            </th>
            <th>
              Тип
              <div className="resizer" />
            </th>
            <th>
              Обязательность
              <div className="resizer" />
            </th>
            <th>
              Описание
              <div className="resizer" />
            </th>
            <th>Пример</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, index) => {
            const checkTypeMatch = (declared: string, exampleValue: any): boolean => {
              const v = exampleValue == null ? '' : String(exampleValue).trim();
              const unq = v.replace(/^"|"$/g, '');
              if (declared === 'string') return true;
              if (declared === 'int') {
                if (unq === '') return false;
                try {
                  const bi = BigInt(unq);
                  const min = BigInt(-2147483648);
                  const max = BigInt(2147483647);
                  return bi >= min && bi <= max;
                } catch {
                  return false;
                }
              }
              if (declared === 'long') {
                if (unq === '') return false;
                try {
                  BigInt(unq);
                  return true;
                } catch {
                  return false;
                }
              }
              if (declared === 'number') {
                if (unq === '') return false;
                const n = Number(unq);
                return Number.isFinite(n);
              }
              if (declared === 'boolean') {
                const low = unq.toLowerCase();
                return low === 'true' || low === 'false';
              }
              if (declared === 'array') {
                try {
                  const parsed = JSON.parse(unq);
                  return Array.isArray(parsed);
                } catch {
                  return false;
                }
              }
              if (declared === 'array_object') {
                try {
                  const parsed = JSON.parse(unq);
                  return Array.isArray(parsed) && parsed.every((el: any) => el !== null && typeof el === 'object' && !Array.isArray(el));
                } catch {
                  return false;
                }
              }
              if (declared === 'object') {
                try {
                  const parsed = JSON.parse(unq);
                  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
                } catch {
                  return false;
                }
              }
              return true;
            };

            const parsedVal = getValueByField(row.field);
            const mismatched = parsedVal === undefined ? !checkTypeMatch(row.type, row.example) : !checkTypeMatch(row.type, parsedVal);

            return (
              <tr key={`${section.id}-${index}`}>
                <td>
                  <input
                    type="text"
                    value={row.field}
                    onChange={(event) =>
                      updateSection(section.id, (current) => {
                        if (current.kind === 'parsed') {
                          const updatedRows = [...current.rows];
                          updatedRows[index] = { ...updatedRows[index], field: event.target.value };
                          return { ...current, rows: updatedRows };
                        }
                        return current;
                      })
                    }
                  />
                  <span style={{ marginLeft: 6 }}>{row.required === '+' ? '*' : ''}</span>
                </td>
                <td>
                  <select
                    value={row.type}
                    onChange={(event) =>
                      updateSection(section.id, (current) => {
                        if (current.kind === 'parsed') {
                          const updatedRows = [...current.rows];
                          updatedRows[index] = { ...updatedRows[index], type: event.target.value };
                          return { ...current, rows: updatedRows };
                        }
                        return current;
                      })
                    }
                  >
                      <option value="string">string</option>
                      <option value="int">int</option>
                      <option value="long">long</option>
                      <option value="boolean">boolean</option>
                      <option value="array">array</option>
                      <option value="array_object">array&lt;object&gt;</option>
                      <option value="object">object</option>
                  </select>
                </td>
                <td>
                  <label>
                    <input
                      type="checkbox"
                      checked={row.required === '+'}
                      onChange={(event) =>
                        updateSection(section.id, (current) => {
                          if (current.kind === 'parsed') {
                            const updatedRows = [...current.rows];
                            updatedRows[index] = { ...updatedRows[index], required: event.target.checked ? '+' : '-' };
                            return { ...current, rows: updatedRows };
                          }
                          return current;
                        })
                      }
                    />
                  </label>
                </td>
                <td>
                  <textarea
                    rows={2}
                    value={row.description}
                    onChange={(event) =>
                      updateSection(section.id, (current) => {
                        if (current.kind === 'parsed') {
                          const updatedRows = [...current.rows];
                          updatedRows[index] = { ...updatedRows[index], description: event.target.value };
                          return { ...current, rows: updatedRows };
                        }
                        return current;
                      })
                    }
                  />
                </td>
                <td>
                  {(() => {
                    const disp = ['array', 'object', 'array_object'].includes(row.type) ? '-' : row.example;
                    return (
                      <>
                        <textarea className={mismatched ? 'mismatch' : ''} rows={2} readOnly value={disp} />
                        {mismatched && <div className="mismatch-icon" title={`Пример не соответствует типу ${row.type}`}>!</div>}
                      </>
                    );
                  })()}
                </td>
                <td>
                  <button
                    onClick={() =>
                      updateSection(section.id, (current) => {
                        if (current.kind === 'parsed') {
                          const updatedRows = current.rows.filter((_, i) => i !== index);
                          return { ...current, rows: updatedRows };
                        }
                        return current;
                      })
                    }
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Хук для поддержки изменения ширины колонок таблицы
function useColumnResizer(tableRef: React.RefObject<HTMLTableElement>, deps: any[]) {
  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let colIndex = -1;
    const colRefs = table.querySelectorAll('col') as HTMLCollectionOf<HTMLTableColElement>;

    const ths = Array.from(table.querySelectorAll('th')) as HTMLElement[];
    table.style.tableLayout = 'fixed';

    // initialize col widths from header sizes
    if (colRefs.length === ths.length) {
      ths.forEach((th, i) => {
        const w = Math.max(40, Math.round(th.getBoundingClientRect().width));
        const col = colRefs[i];
        if (col) col.style.width = `${w}px`;
      });
    }

    function onMouseMove(e: MouseEvent) {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const newWidth = Math.max(40, startWidth + dx);
      const cols = Array.from(table.querySelectorAll('col')) as HTMLCollectionOf<HTMLTableColElement>;
      const col = cols[colIndex];
      if (col) col.style.width = `${newWidth}px`;
    }

    function onMouseUp() {
      if (!isResizing) return;
      isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    const handlers: Array<() => void> = [];
    // diagnostic
    // eslint-disable-next-line no-console
    console.debug('useColumnResizer attach', { thCount: ths.length });
    ths.forEach((th, idx) => {
      const handle = th.querySelector('.resizer') as HTMLElement | null;
      if (!handle) return;
      const onPointerDown = (ev: PointerEvent) => {
        isResizing = true;
        colIndex = idx;
        startX = ev.clientX;
        startWidth = th.getBoundingClientRect().width;
        document.addEventListener('pointermove', onPointerMove as any);
        document.addEventListener('pointerup', onPointerUp as any);
        (ev as any).preventDefault();
      };
      const onPointerMove = (e: PointerEvent) => onMouseMove(e as any);
      const onPointerUp = () => onMouseUp();

      handle.addEventListener('pointerdown', onPointerDown as any);
      handlers.push(() => handle.removeEventListener('pointerdown', onPointerDown as any));
    });

    return () => {
      // remove per-handle listeners
      handlers.forEach((fn) => fn());
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? []);
}

// Маленькая таблица с поддержкой изменения ширины колонок (для Headers/Body/URL)
function SmallTable({
  title,
  items,
  section,
  updateSection
}: {
  title: string;
  items: { r: any; i: number }[];
  section: ParsedSection;
  updateSection: (id: string, updater: (section: DocSection) => DocSection) => void;
}) {
  const tableRef = useRef<HTMLTableElement | null>(null);

  useColumnResizer(tableRef, section.rows);

  return (
    <div className="subtable">
      <h4>{title}</h4>
      <div className="table-wrap">
        <table ref={tableRef}>
        <colgroup>
          <col />
          <col />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>
              Поле
              <div className="resizer" />
            </th>
            <th>
              Тип
              <div className="resizer" />
            </th>
            <th>
              Обязательность
              <div className="resizer" />
            </th>
            <th>
              Описание
              <div className="resizer" />
            </th>
            <th>Пример</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map(({ r, i }) => (
            <tr key={`${section.id}-${i}`}>
              <td>
                <input
                  type="text"
                  value={r.field}
                  onChange={(e) =>
                    updateSection(section.id, (current) => {
                      if (current.kind !== 'parsed') return current;
                      const updated = [...current.rows];
                      updated[i] = { ...updated[i], field: e.target.value };
                      return { ...current, rows: updated };
                    })
                  }
                />
                <span style={{ marginLeft: 6 }}>{r.required === '+' ? '*' : ''}</span>
              </td>
              <td>
                <select
                  value={r.type}
                  onChange={(e) =>
                    updateSection(section.id, (current) => {
                      if (current.kind !== 'parsed') return current;
                      const updated = [...current.rows];
                      updated[i] = { ...updated[i], type: e.target.value };
                      return { ...current, rows: updated };
                    })
                  }
                >
                  <option value="string">string</option>
                  <option value="int">int</option>
                  <option value="long">long</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="array">array</option>
                  <option value="array_object">array&lt;object&gt;</option>
                  <option value="object">object</option>
                </select>
              </td>
              <td>
                <label>
                  <input
                    type="checkbox"
                    checked={r.required === '+'}
                    onChange={(e) =>
                      updateSection(section.id, (current) => {
                        if (current.kind !== 'parsed') return current;
                        const updated = [...current.rows];
                        updated[i] = { ...updated[i], required: e.target.checked ? '+' : '-' };
                        return { ...current, rows: updated };
                      })
                    }
                  />
                </label>
              </td>
              <td>
                <textarea
                  rows={2}
                  value={r.description}
                  onChange={(e) =>
                    updateSection(section.id, (current) => {
                      if (current.kind !== 'parsed') return current;
                      const updated = [...current.rows];
                      updated[i] = { ...updated[i], description: e.target.value };
                      return { ...current, rows: updated };
                    })
                  }
                />
              </td>
              <td>
                {(() => {
                  const disp = ['array', 'object', 'array_object'].includes(r.type) ? '-' : r.example;
                  return <textarea rows={2} readOnly value={disp} />;
                })()}
              </td>
              <td>
                <button
                  onClick={() =>
                    updateSection(section.id, (current) => {
                      if (current.kind !== 'parsed') return current;
                      const updated = current.rows.filter((_, idx) => idx !== i);
                      return { ...current, rows: updated };
                    })
                  }
                >
                  Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
