import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DocSection, MethodDocument, ParsedRow, ParsedSection, RequestMethod } from '../../types';
import { richTextToHtml } from '../../richText';
import { getSectionRows } from '../../sectionHelpers';
import { HttpChip } from '../primitives/WorkbenchPrimitives';
import { WorkbenchDiagramPreview } from './WorkbenchDiagramPreview';

type LinkedMethodPreviewProps = {
  methods: MethodDocument[];
  selectedMethodId: string;
  onSelectMethod: (methodId: string) => void;
  onClose: () => void;
  getMethodHttpMethod: (method: MethodDocument | null | undefined) => RequestMethod;
  getMethodPath: (method: MethodDocument | null | undefined) => string;
};

function getVisibleRows(section: ParsedSection): ParsedRow[] {
  return getSectionRows(section).filter((row) => row.enabled !== false);
}

function ReadOnlyRows({ rows }: { rows: ParsedRow[] }): ReactNode {
  if (rows.length === 0) return <div className="linked-preview-empty">Таблица пока пустая</div>;
  return (
    <div className="linked-preview-table-wrap">
      <table className="linked-preview-table">
        <thead>
          <tr><th>Параметр</th><th>Тип</th><th>Обяз.</th><th>Описание</th><th>Пример</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? `${row.sourceField ?? row.field}-${index}`}>
              <td><code>{row.field || row.clientField || '—'}</code></td>
              <td>{row.type || '—'}</td>
              <td>{row.required || '—'}</td>
              <td>{row.description || '—'}</td>
              <td><code>{row.example || '—'}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReadOnlySection({ section }: { section: DocSection }): ReactNode {
  const title = section.title.trim() || 'Без названия';
  return (
    <section className="linked-preview-section">
      <div className="linked-preview-section-head">
        <strong>{title}</strong>
        <span className={section.enabled ? 'enabled' : ''}>{section.enabled ? 'Активна' : 'Отключена'}</span>
      </div>
      <div className="linked-preview-section-body">
        {section.kind === 'text' && (
          section.value.trim()
            ? <div className="linked-preview-rich-text" dangerouslySetInnerHTML={{ __html: richTextToHtml(section.value) }} />
            : <div className="linked-preview-empty">Содержимое не заполнено</div>
        )}
        {section.kind === 'parsed' && (
          <>
            <div className="linked-preview-section-meta">
              {section.sectionType === 'request' ? 'Request' : section.sectionType === 'response' ? 'Response' : 'Параметры'}
              {' · '}
              {getVisibleRows(section).length} параметров
            </div>
            {(() => {
              const visibleRows = getVisibleRows(section);
              const headerRows = visibleRows.filter((row) => row.source === 'header');
              const parameterRows = visibleRows.filter((row) => row.source !== 'header');
              return (
                <>
                  {headerRows.length > 0 && (
                    <div className="linked-preview-row-group">
                      <strong>Headers</strong>
                      <ReadOnlyRows rows={headerRows} />
                    </div>
                  )}
                  <div className="linked-preview-row-group">
                    <strong>{section.sectionType === 'response' ? 'Параметры ответа' : 'Параметры запроса'}</strong>
                    <ReadOnlyRows rows={parameterRows} />
                  </div>
                </>
              );
            })()}
            {section.error && <div className="linked-preview-error">{section.error}</div>}
          </>
        )}
        {section.kind === 'diagram' && (
          <div className="linked-preview-diagrams">
            {section.diagrams.length === 0 && <div className="linked-preview-empty">Диаграммы не добавлены</div>}
            {section.diagrams.map((diagram, index) => (
              <div key={diagram.id} className="linked-preview-diagram">
                <strong>{diagram.title.trim() || `Диаграмма ${index + 1}`}</strong>
                {diagram.code.trim()
                  ? <WorkbenchDiagramPreview code={diagram.code} engine={diagram.engine} title={diagram.title || `Диаграмма ${index + 1}`} />
                  : <div className="linked-preview-empty">Код диаграммы не заполнен</div>}
              </div>
            ))}
          </div>
        )}
        {section.kind === 'errors' && (
          <div className="linked-preview-table-wrap">
            {section.rows.length === 0 ? (
              <div className="linked-preview-empty">Ошибки не описаны</div>
            ) : (
              <table className="linked-preview-table">
                <thead><tr><th>HTTP</th><th>internalCode</th><th>Условие</th><th>Сообщение</th></tr></thead>
                <tbody>
                  {section.rows.map((row, index) => (
                    <tr key={`${row.internalCode}-${index}`}>
                      <td>{row.clientHttpStatus || row.serverHttpStatus || '—'}</td>
                      <td><code>{row.internalCode || '—'}</code></td>
                      <td>{row.trigger || '—'}</td>
                      <td>{row.message || row.clientResponse || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function LinkedMethodPreview({
  methods,
  selectedMethodId,
  onSelectMethod,
  onClose,
  getMethodHttpMethod,
  getMethodPath
}: LinkedMethodPreviewProps): ReactNode {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const method = methods.find((item) => item.id === selectedMethodId) ?? methods[0];
  const filteredMethods = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return methods;
    return methods.filter((item) =>
      item.name.toLowerCase().includes(query) || getMethodPath(item).toLowerCase().includes(query)
    );
  }, [getMethodPath, methods, search]);

  useEffect(() => {
    if (!pickerOpen) return;
    searchRef.current?.focus();
    const closeOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) setPickerOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPickerOpen(false);
        pickerButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [pickerOpen]);

  if (!method) return null;

  return (
    <aside className="linked-method-preview" aria-label="Связанный метод">
      <header className="linked-preview-header">
        <div className="linked-preview-header-top">
          <div className="linked-preview-picker" ref={pickerRef}>
            <button
              ref={pickerButtonRef}
              type="button"
              className="linked-preview-picker-button"
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              onClick={() => {
                setSearch('');
                setPickerOpen((current) => !current);
              }}
            >
              <HttpChip method={getMethodHttpMethod(method)} size="sm" />
              <span>{method.name}</span>
              <span aria-hidden>⌄</span>
            </button>
            {pickerOpen && (
              <div className="linked-preview-picker-popover">
                <label>
                  <span aria-hidden>⌕</span>
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Поиск методов…"
                    aria-label="Поиск связанного метода"
                  />
                </label>
                <div role="listbox" aria-label="Методы проекта">
                  {filteredMethods.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={item.id === method.id}
                      onClick={() => {
                        onSelectMethod(item.id);
                        setPickerOpen(false);
                        pickerButtonRef.current?.focus();
                      }}
                    >
                      <HttpChip method={getMethodHttpMethod(item)} size="sm" />
                      <span>{item.name}</span>
                      <code>{getMethodPath(item)}</code>
                    </button>
                  ))}
                  {filteredMethods.length === 0 && <div className="linked-preview-picker-empty">Ничего не найдено</div>}
                </div>
              </div>
            )}
          </div>
          <span className="linked-preview-spacer" />
          <span className="linked-preview-badge">◉ Ссылка</span>
          <button type="button" className="linked-preview-close" onClick={onClose} aria-label="Закрыть сплит">×</button>
        </div>
        <div className="linked-preview-tabs" role="tablist" aria-label="Контекст связанного метода">
          <button type="button" role="tab" aria-selected="true">Methods</button>
          <button type="button" role="tab" aria-selected="false" aria-disabled="true">Project Docs</button>
        </div>
      </header>
      <div className="linked-preview-body">
        <div className="linked-preview-method-meta">
          <HttpChip method={getMethodHttpMethod(method)} size="sm" />
          <code>{getMethodPath(method)}</code>
        </div>
        {method.sections.map((section) => <ReadOnlySection key={section.id} section={section} />)}
      </div>
    </aside>
  );
}
