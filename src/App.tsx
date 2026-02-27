import { useEffect, useMemo, useState, useRef } from 'react';
import './App.css';
import { parseToRows } from './parsers';
import { renderHtmlDocument } from './renderHtml';
import { renderWikiDocument } from './renderWiki';
import type { DocSection, ParsedSection, ParseFormat, ProjectData } from './types';

const STORAGE_KEY = 'doc-builder-project-v1';

function createInitialSections(): DocSection[] {
  return [
    { id: 'goal', title: 'Цель', enabled: true, kind: 'text', value: '', required: true },
    { id: 'external-url', title: 'Внешний URL', enabled: true, kind: 'text', value: '' },
    {
      id: 'request',
      title: 'Request (cURL)',
      enabled: true,
      kind: 'parsed',
      format: 'curl',
      input: '',
      rows: [],
      error: ''
    },
    {
      id: 'body',
      title: 'Body / Выходные параметры',
      enabled: true,
      kind: 'parsed',
      format: 'json',
      input: '',
      rows: [],
      error: ''
    },
    { id: 'errors', title: 'Ошибки', enabled: true, kind: 'text', value: '' },
    { id: 'non-functional', title: 'Нефункциональные требования', enabled: true, kind: 'text', value: '' },
    {
      id: 'future',
      title: 'Доработки, планирующиеся на следующих этапах',
      enabled: false,
      kind: 'text',
      value: ''
    }
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
  return { version: 1, updatedAt: new Date().toISOString(), sections };
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

function App() {
  const [sections, setSections] = useState<DocSection[]>(() => loadProject());
  const [importError, setImportError] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(asProjectData(sections)));
  }, [sections]);

  const validationMap = useMemo(() => {
    const result = new Map<string, string>();
    for (const section of sections) result.set(section.id, validateSection(section));
    return result;
  }, [sections]);

  const htmlOutput = useMemo(() => renderHtmlDocument(sections), [sections]);
  const wikiOutput = useMemo(() => renderWikiDocument(sections), [sections]);

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
        setImportError('');
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Ошибка импорта');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app">
      <h1>Конструктор документации API</h1>
      <p className="hint">MVP: локальная работа, мягкая валидация, экспорт в HTML и Confluence Wiki Markup.</p>

      <div className="toolbar">
        <button onClick={() => downloadText('documentation.html', htmlOutput)}>Экспорт HTML</button>
        <button onClick={() => downloadText('documentation.wiki', wikiOutput)}>Экспорт Wiki</button>
        <button onClick={exportProjectJson}>Экспорт проекта JSON</button>
        <button
          onClick={() => {
            if (!confirm('Сбросить все секции и очистить проект? Это действие необратимо.')) return;
            setSections(createInitialSections());
            localStorage.removeItem(STORAGE_KEY);
          }}
        >
          Сбросить всё
        </button>
        <label className="import-label">
          Импорт проекта JSON
          <input
            type="file"
            accept="application/json"
            onChange={(event) => importProjectJson(event.target.files?.[0])}
          />
        </label>
      </div>

      {importError && <p className="error">Ошибка импорта: {importError}</p>}

      <div className="grid">
        <section>
          <h2>Секции документа</h2>
          {sections.map((section) => (
            <article key={section.id} className="card">
              <div className="card-head">
                <h3>{section.title}</h3>
                <label>
                  <input
                    type="checkbox"
                    checked={section.enabled}
                    onChange={(event) =>
                      updateSection(section.id, (current) => ({ ...current, enabled: event.target.checked }))
                    }
                  />{' '}
                  Использовать
                </label>
              </div>

              {section.kind === 'text' && (
                <textarea
                  rows={5}
                  value={section.value}
                  onChange={(event) =>
                    updateSection(section.id, (current) =>
                      current.kind === 'text' ? { ...current, value: event.target.value } : current
                    )
                  }
                  placeholder="Введите текст секции"
                />
              )}

              {section.kind === 'parsed' && (
                <div className="parsed-box">
                  <div className="parsed-controls">
                    <select
                      value={section.format}
                      onChange={(event) =>
                        updateSection(section.id, (current) =>
                          current.kind === 'parsed'
                            ? { ...current, format: event.target.value as ParseFormat, rows: [], error: '' }
                            : current
                        )
                      }
                    >
                      <option value="json">JSON</option>
                      <option value="xml">XML</option>
                      {section.id === 'request' && <option value="curl">cURL (REST)</option>}
                    </select>
                    <button onClick={() => runParser(section)}>Парсить в таблицу</button>
                  </div>
                  <textarea
                    rows={8}
                    value={section.input}
                    onChange={(event) =>
                      updateSection(section.id, (current) =>
                        current.kind === 'parsed' ? { ...current, input: event.target.value, error: '' } : current
                      )
                    }
                    placeholder="Вставьте JSON, XML или cURL"
                  />

                  {section.error && <p className="error">{section.error}</p>}

                  {section.rows.length > 0 && section.format === 'curl' ? (
                    <div className="curl-groups">
                      {/* Group rows with their original indices so updates map back correctly */}
                      {(() => {
                        const indexed = section.rows.map((r, i) => ({ r, i }));
                        const headerRows = indexed.filter(({ r }) => (r as any).source === 'header');
                        const bodyRows = indexed.filter(({ r }) => (r as any).source === 'body');

                        // replaced by <SmallTable /> components below

                        return (
                          <div>
                            <SmallTable title="Headers" items={headerRows} section={section} updateSection={updateSection} />
                            <SmallTable title="Body" items={bodyRows} section={section} updateSection={updateSection} />
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    section.rows.length > 0 && <ParsedTable section={section} updateSection={updateSection} />
                  )}
                </div>
              )}

              {validationMap.get(section.id) && <p className="warning">{validationMap.get(section.id)}</p>}
            </article>
          ))}
        </section>

        <section>
          <h2>Результат генерации</h2>
          <h3>HTML</h3>
          <textarea readOnly rows={14} value={htmlOutput} />
          <h3>Confluence Wiki Markup</h3>
          <textarea readOnly rows={14} value={wikiOutput} />
        </section>
      </div>
    </div>
  );
}

// Компонент таблицы с возможностью вручную менять ширину колонок перетаскиванием
function ParsedTable({
  section,
  updateSection
}: {
  section: ParsedSection;
  updateSection: (id: string, updater: (section: DocSection) => DocSection) => void;
}) {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const colRefs = useRef<HTMLCollectionOf<HTMLTableColElement> | null>(null);

  // Устанавливаем обработчики для ручек изменения ширины колонок
  useColumnResizer(tableRef, section.rows);

  // Попытка получить исходные значения из section.input (для JSON / cURL)
  let sourceJson: any = null;
  let headerScalars: Record<string, string> = {};
  let headerObjects: Record<string, any> = {};
  let curlBody: any = null;
  if (section.format === 'json') {
    try {
      sourceJson = JSON.parse(section.input);
    } catch {
      sourceJson = null;
    }
  } else if (section.format === 'curl') {
    try {
      const normalized = section.input.replace(/\r\n/g, ' ').replace(/\n/g, ' ');
      const headerMatches = Array.from(normalized.matchAll(/(?:-H|--header)\s+['"]([^'\"]+)['"]/g));
      for (const match of headerMatches) {
        const hv = match[1];
        const si = hv.indexOf(':');
        const name = si > -1 ? hv.slice(0, si).trim() : hv.trim();
        const value = si > -1 ? hv.slice(si + 1).trim() : '';
        // try parse header value as JSON
        const looksLikeJson = /^\s*[\[{].*[\]}]\s*$/.test(value);
        if (looksLikeJson) {
          try {
            const parsed = JSON.parse(value);
            headerObjects[name] = parsed;
          } catch {
            headerScalars[name] = value;
          }
        } else {
          headerScalars[name] = value;
        }
      }
      const dataMatch = normalized.match(/(?:--data-raw|--data|-d)\s+(['"])([\s\S]*?)\1/);
      if (dataMatch) {
        const payload = dataMatch[2].trim();
        try {
          curlBody = JSON.parse(payload);
        } catch {
          curlBody = payload;
        }
      }
    } catch {
      headerScalars = {};
      headerObjects = {};
      curlBody = null;
    }
  }

  const getValueByField = (field: string): any => {
    if (section.format === 'json' && sourceJson != null) {
      const parts = field.split('.');
      let cur: any = sourceJson;
      for (const part of parts) {
        const arrMatch = part.match(/(\w+)\[(\d+)\]$/);
        if (arrMatch) {
          const key = arrMatch[1];
          const idx = Number(arrMatch[2]);
          if (cur && typeof cur === 'object' && key in cur) {
            cur = cur[key];
            if (Array.isArray(cur)) cur = cur[idx];
            else return undefined;
          } else return undefined;
        } else {
          if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
          else return undefined;
        }
      }
      return cur;
    }
    if (section.format === 'curl') {
      // header exact match
      if (field in headerScalars) return headerScalars[field];
      // header objects: check prefix
      const dotIdx = field.indexOf('.');
      if (dotIdx > -1) {
        const prefix = field.slice(0, dotIdx);
        const rest = field.slice(dotIdx + 1);
        if (prefix in headerObjects) {
          let cur: any = headerObjects[prefix];
          const parts = rest.split('.');
          for (const part of parts) {
            const arrMatch = part.match(/(\w+)\[(\d+)\]$/);
            if (arrMatch) {
              const key = arrMatch[1];
              const idx = Number(arrMatch[2]);
              if (cur && typeof cur === 'object' && key in cur) {
                cur = cur[key];
                if (Array.isArray(cur)) cur = cur[idx];
                else return undefined;
              } else return undefined;
            } else {
              if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
              else return undefined;
            }
          }
          return cur;
        }
      }

      // body top-level or nested (fields produced without 'body.' prefix)
      if (curlBody != null) {
        if (typeof curlBody === 'string') {
          if (field === 'body') return curlBody;
        } else {
          const parts = field.split('.');
          let cur: any = curlBody;
          for (const part of parts) {
            const arrMatch = part.match(/(\w+)\[(\d+)\]$/);
            if (arrMatch) {
              const key = arrMatch[1];
              const idx = Number(arrMatch[2]);
              if (cur && typeof cur === 'object' && key in cur) {
                cur = cur[key];
                if (Array.isArray(cur)) cur = cur[idx];
                else return undefined;
              } else return undefined;
            } else {
              if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
              else return undefined;
            }
          }
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
