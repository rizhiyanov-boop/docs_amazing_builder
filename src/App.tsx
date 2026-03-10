import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import './App.css';
import { parseToRows } from './parsers';
import { getRequestColumnLabel, getRequestColumnOrder, moveRequestColumn } from './requestColumns';
import { getEditorRequestRows, getInputDriftRows, getMappedClientField, getMappingOptions, getParsedRowKey, getPreviouslyUsedClientKeys, isRequestMappingRow, OPTIONAL_MARK } from './requestHeaders';
import { renderHtmlDocument } from './renderHtml';
import { renderWikiDocument } from './renderWiki';
import { DEFAULT_SECTION_TITLE, resolveSectionTitle, sanitizeSections } from './sectionTitles';
import { buildInputFromRows } from './sourceSync';
import { applyThemeToRoot } from './theme';
import type { ThemeName } from './theme';
import type { DocSection, ParsedRow, ParsedSection, ParseFormat, ProjectData, RequestColumnKey } from './types';

const STORAGE_KEY = 'doc-builder-project-v2';

type TabKey = 'editor' | 'html' | 'wiki' | 'split';
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';
type ParseTarget = 'server' | 'client';

type AutosaveInfo = { state: AutosaveState; at?: string };
type TableValidation = Map<string, string>;
type EditableFieldState = {
  sectionId: string;
  rowKey: string;
  draft: string;
};
type EditableTitleState = {
  sectionId: string;
  draft: string;
};
type DriftAlertState = Record<string, boolean>;

function createInitialSections(): DocSection[] {
  return [
    { id: 'goal', title: 'Цель', enabled: true, kind: 'text', value: '', required: true },
    { id: 'external-url', title: 'Внешний URL', enabled: true, kind: 'text', value: '' },
    {
      id: 'request',
      title: 'Request',
      enabled: true,
      kind: 'parsed',
      format: 'curl',
      lastSyncedFormat: 'curl',
      input: '',
      rows: [],
      error: '',
      domainModelEnabled: false,
      clientFormat: 'json',
      clientLastSyncedFormat: 'json',
      clientInput: '',
      clientRows: [],
      clientError: '',
      clientMappings: {}
    },
    {
      id: 'response',
      title: 'Response',
      enabled: true,
      kind: 'parsed',
      format: 'json',
      lastSyncedFormat: 'json',
      input: '',
      rows: [],
      error: '',
      domainModelEnabled: false,
      clientFormat: 'json',
      clientLastSyncedFormat: 'json',
      clientInput: '',
      clientRows: [],
      clientError: '',
      clientMappings: {}
    },
    { id: 'errors', title: 'Ошибки', enabled: true, kind: 'text', value: '' },
    { id: 'non-functional', title: 'Нефункциональные требования', enabled: true, kind: 'text', value: '' },
    { id: 'future', title: 'Доработки, планирующиеся на следующих этапах', enabled: false, kind: 'text', value: '' }
  ];
}

function isRequestSection(section: ParsedSection): boolean {
  return section.id === 'request';
}

function isResponseSection(section: ParsedSection): boolean {
  return section.id === 'response';
}

function isDualModelSection(section: ParsedSection): boolean {
  return isRequestSection(section) || isResponseSection(section);
}

function getSectionSideLabel(section: ParsedSection, target: ParseTarget): string {
  const kind = isResponseSection(section) ? 'response' : 'request';
  return `${target === 'client' ? 'Client' : 'Server'} ${kind}`;
}

function getSectionRows(section: ParsedSection): ParsedRow[] {
  return isDualModelSection(section) ? getEditorRequestRows(section) : section.rows;
}

function validateSection(section: DocSection): string {
  if (section.kind !== 'parsed') return '';

  if (isDualModelSection(section)) {
    const hasServerInput = Boolean(section.input.trim());
    const hasClientInput = section.domainModelEnabled ? Boolean(section.clientInput?.trim()) : false;

    if (!hasServerInput && !hasClientInput) return 'Введите исходные данные для парсинга';
    if (section.error) return `Секция заблокирована: ${section.error}`;
    if (section.clientError) return `${getSectionSideLabel(section, 'client')} заблокирован: ${section.clientError}`;
    if (getSectionRows(section).length === 0) return 'Нет распарсенных строк';
    return '';
  }

  if (!section.input.trim()) return 'Введите исходные данные для парсинга';
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
  const fromIndex = next.findIndex((section) => section.id === fromId);
  const toIndex = next.findIndex((section) => section.id === toId);
  if (fromIndex === -1 || toIndex === -1) return list;
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isCustomSection(section: DocSection): boolean {
  return section.id.startsWith('custom-');
}

function getDuplicateValueSet(rows: ParsedRow[]): Set<string> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = row.field.trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value)
  );
}

export default function App() {
  const [sections, setSections] = useState<DocSection[]>(() => loadProject());
  const [selectedId, setSelectedId] = useState<string>(() => createInitialSections()[0].id);
  const [tab, setTab] = useState<TabKey>('editor');
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [autosave, setAutosave] = useState<AutosaveInfo>({ state: 'idle' });
  const [importError, setImportError] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<RequestColumnKey | null>(null);
  const [editingField, setEditingField] = useState<EditableFieldState | null>(null);
  const [editingTitle, setEditingTitle] = useState<EditableTitleState | null>(null);
  const [expandedDriftAlerts, setExpandedDriftAlerts] = useState<DriftAlertState>({});

  useEffect(() => {
    if (!sections.find((section) => section.id === selectedId) && sections[0]) {
      setSelectedId(sections[0].id);
    }
  }, [sections, selectedId]);

  const validationMap: TableValidation = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) map.set(section.id, validateSection(section));
    return map;
  }, [sections]);

  const selectedSection = sections.find((section) => section.id === selectedId) ?? sections[0];
  const selectedServerDriftRows = selectedSection?.kind === 'parsed' ? getInputDriftRows(selectedSection.rows) : [];
  const selectedClientDriftRows =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection) ? getInputDriftRows(selectedSection.clientRows ?? []) : [];
  const selectedServerDuplicateValues = selectedSection?.kind === 'parsed' ? Array.from(getDuplicateValueSet(selectedSection.rows)) : [];
  const selectedClientDuplicateValues =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection) ? Array.from(getDuplicateValueSet(selectedSection.clientRows ?? [])) : [];
  const selectedServerFormatDrift =
    selectedSection?.kind === 'parsed' ? Boolean(selectedSection.rows.length > 0 && selectedSection.lastSyncedFormat && selectedSection.lastSyncedFormat !== selectedSection.format) : false;
  const selectedClientFormatDrift =
    selectedSection?.kind === 'parsed' && isDualModelSection(selectedSection)
      ? Boolean((selectedSection.clientRows ?? []).length > 0 && selectedSection.clientLastSyncedFormat && selectedSection.clientLastSyncedFormat !== (selectedSection.clientFormat ?? 'json'))
      : false;

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

  function startTitleEditing(section: DocSection): void {
    setEditingTitle({
      sectionId: section.id,
      draft: section.title
    });
  }

  function cancelTitleEditing(): void {
    setEditingTitle(null);
  }

  function saveTitleEditing(): void {
    if (!editingTitle) return;
    updateSectionTitle(editingTitle.sectionId, resolveSectionTitle(editingTitle.draft));
    setEditingTitle(null);
  }

  function deleteSection(id: string): void {
    setSections((prev) => {
      const deletedIndex = prev.findIndex((section) => section.id === id);
      if (deletedIndex === -1) return prev;

      const next = prev.filter((section) => section.id !== id);

      if (selectedId === id) {
        const fallback = next[deletedIndex] ?? next[deletedIndex - 1] ?? next[0];
        if (fallback) setSelectedId(fallback.id);
      }

      return next;
    });
  }

  function runParser(section: ParsedSection, target: ParseTarget = 'server'): void {
    const format = target === 'client' ? section.clientFormat ?? 'json' : section.format;
    const input = target === 'client' ? section.clientInput ?? '' : section.input;

    try {
      const rows = parseToRows(format, input);
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        if (target === 'client' && isDualModelSection(current)) {
          return { ...current, clientRows: rows, clientError: '', clientLastSyncedFormat: current.clientFormat ?? 'json' };
        }
        return { ...current, rows, error: '', lastSyncedFormat: current.format };
      });
    } catch (error) {
      updateSection(section.id, (current) => {
        if (current.kind !== 'parsed') return current;
        const message = error instanceof Error ? error.message : 'Ошибка парсинга';
        if (target === 'client' && isDualModelSection(current)) {
          return { ...current, clientRows: [], clientError: message };
        }
        return { ...current, rows: [], error: message };
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

  function addManualRow(section: ParsedSection, target: ParseTarget = 'server'): void {
    const manualRow: ParsedRow = {
      field: `newField${Date.now()}`,
      origin: 'manual',
      type: 'string',
      required: OPTIONAL_MARK,
      description: '',
      example: '',
      source: isDualModelSection(section) ? 'body' : 'parsed'
    };

    updateSection(section.id, (current) => {
      if (current.kind !== 'parsed') return current;
      if (target === 'client' && isDualModelSection(current)) {
        return { ...current, clientRows: [...(current.clientRows ?? []), manualRow] };
      }
      return { ...current, rows: [...current.rows, manualRow] };
    });
  }

  function syncInputFromRows(section: ParsedSection, target: ParseTarget = 'server'): void {
    updateSection(section.id, (current) => {
      if (current.kind !== 'parsed') return current;

      if (target === 'client' && isDualModelSection(current)) {
        const clientRows = current.clientRows ?? [];
        return {
          ...current,
          clientInput: buildInputFromRows(current.clientFormat ?? 'json', clientRows),
          clientLastSyncedFormat: current.clientFormat ?? 'json',
          clientRows: clientRows.map((row) =>
            row.origin === 'generated'
              ? row
              : { ...row, sourceField: row.field, origin: row.origin === 'manual' ? 'parsed' : row.origin }
          )
        };
      }

      return {
        ...current,
        input: buildInputFromRows(current.format, current.rows),
        lastSyncedFormat: current.format,
        rows: current.rows.map((row) =>
          row.origin === 'generated'
            ? row
            : { ...row, sourceField: row.field, origin: row.origin === 'manual' ? 'parsed' : row.origin }
        )
      };
    });
  }

  function startFieldEditing(section: ParsedSection, row: ParsedRow): void {
    if (!row.field.trim()) return;
    setEditingField({
      sectionId: section.id,
      rowKey: getParsedRowKey(row),
      draft: row.field
    });
  }

  function cancelFieldEditing(): void {
    setEditingField(null);
  }

  function saveFieldEditing(): void {
    if (!editingField) return;

    const nextField = editingField.draft.trim();
    if (!nextField) {
      setEditingField(null);
      return;
    }

    updateSection(editingField.sectionId, (current) => {
      if (current.kind !== 'parsed') return current;

      let updated = false;
      const rows = current.rows.map((row) => {
        if (!updated && getParsedRowKey(row) === editingField.rowKey) {
          updated = true;
          return { ...row, field: nextField };
        }
        return row;
      });

      if (!updated) return current;

      return { ...current, rows };
    });

    setEditingField(null);
  }

  function renderEditableFieldCell(section: ParsedSection, row: ParsedRow): ReactNode {
    if (!row.field.trim()) return '—';

    const isEditing =
      editingField?.sectionId === section.id &&
      editingField.rowKey === getParsedRowKey(row);

    if (isEditing) {
      return (
        <div className="field-edit">
          <input
            type="text"
            autoFocus
            value={editingField.draft}
            onChange={(e) => setEditingField((current) => (current ? { ...current, draft: e.target.value } : current))}
            onBlur={saveFieldEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveFieldEditing();
              if (e.key === 'Escape') cancelFieldEditing();
            }}
          />
        </div>
      );
    }

    return (
      <div className="field-display" onDoubleClick={() => startFieldEditing(section, row)}>
        <span>{row.field}</span>
        <button className="icon-button" type="button" onClick={() => startFieldEditing(section, row)} aria-label="Редактировать поле">
          ✎
        </button>
      </div>
    );
  }

  function renderEditableSectionTitle(section: DocSection): ReactNode {
    const isEditing = editingTitle?.sectionId === section.id;

    if (isEditing) {
      return (
        <div className="field-edit title-edit">
          <input
            type="text"
            autoFocus
            value={editingTitle.draft}
            onChange={(e) => setEditingTitle((current) => (current ? { ...current, draft: e.target.value } : current))}
            onBlur={saveTitleEditing}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitleEditing();
              if (e.key === 'Escape') cancelTitleEditing();
            }}
          />
        </div>
      );
    }

    return (
      <div className="field-display title-display" onDoubleClick={() => startTitleEditing(section)}>
        <span>{resolveSectionTitle(section.title)}</span>
        <button className="icon-button" type="button" onClick={() => startTitleEditing(section)} aria-label="Редактировать название блока">
          ✎
        </button>
      </div>
    );
  }

  function renderRequestCell(section: ParsedSection, row: ParsedRow, column: RequestColumnKey): ReactNode {
    const cellMap = {
      field: row.field || '—',
      clientField: row.clientField || '—',
      type: row.type || '—',
      required: row.required || '—',
      description: row.description || '—',
      example: row.example || '—'
    } satisfies Record<RequestColumnKey, string>;

    if (column === 'clientField' && isRequestMappingRow(row) && section.domainModelEnabled) {
      const options = getMappingOptions(section, row.field);
      const previouslyUsedKeys = getPreviouslyUsedClientKeys(section, row);
      const primaryOptions = options.filter((option) => !previouslyUsedKeys.has(getParsedRowKey(option)));
      const previouslyUsedOptions = options.filter((option) => previouslyUsedKeys.has(getParsedRowKey(option)));
      const mappedValue = getMappedClientField(section, row);

      return (
        <div className="mapping-cell">
          <select
            value={mappedValue}
            onChange={(e) =>
              updateSection(section.id, (current) => {
                if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;

                const nextMappings = { ...(current.clientMappings ?? {}) };
                if (e.target.value) {
                  nextMappings[getParsedRowKey(row)] = e.target.value;
                } else {
                  delete nextMappings[getParsedRowKey(row)];
                }

                return { ...current, clientMappings: nextMappings };
              })
            }
          >
            <option value="">—</option>
            {primaryOptions.map((option) => (
              <option key={getParsedRowKey(option)} value={getParsedRowKey(option)}>
                {option.field}
              </option>
            ))}
            {previouslyUsedOptions.length > 0 && (
              <optgroup label="Ранее использованные">
                {previouslyUsedOptions.map((option) => (
                  <option key={getParsedRowKey(option)} value={getParsedRowKey(option)}>
                    {option.field}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {mappedValue && (
            <button
              className="icon-button"
              type="button"
              aria-label="Сбросить маппинг"
              onClick={() =>
                updateSection(section.id, (current) => {
                  if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;
                  const nextMappings = { ...(current.clientMappings ?? {}) };
                  delete nextMappings[getParsedRowKey(row)];
                  return { ...current, clientMappings: nextMappings };
                })
              }
            >
              ×
            </button>
          )}
        </div>
      );
    }

    if (column === 'field') {
      return renderEditableFieldCell(section, row);
    }

    return cellMap[column];
  }

  function renderParsedTable(section: ParsedSection) {
    const rows = getSectionRows(section);
    const duplicateFieldSet = getDuplicateValueSet(section.rows);
    const duplicateClientFieldSet = isDualModelSection(section) ? getDuplicateValueSet(section.clientRows ?? []) : new Set<string>();

    if (rows.length === 0) return <div className="muted">Нет распарсенных строк</div>;

    if (isDualModelSection(section)) {
      const columns = getRequestColumnOrder(section, rows);

      return (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="draggable-column"
                    draggable
                    onDragStart={() => setDraggedColumn(column)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!draggedColumn) return;
                      updateSection(section.id, (current) => {
                        if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;
                        const currentRows = getSectionRows(current);
                        const currentOrder = getRequestColumnOrder(current, currentRows);
                        return { ...current, requestColumnOrder: moveRequestColumn(currentOrder, draggedColumn, column) };
                      });
                      setDraggedColumn(null);
                    }}
                    onDragEnd={() => setDraggedColumn(null)}
                  >
                    {getRequestColumnLabel(section, column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${row.field}-${row.clientField ?? 'server'}-${index}`}
                  className={rowHasMismatch(row, duplicateFieldSet, duplicateClientFieldSet) ? 'mismatch-row' : undefined}
                >
                  {columns.map((column) => (
                    <td key={`${column}-${index}`} className={column === 'type' || column === 'example' ? 'mono' : undefined}>
                      {renderRequestCell(section, row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-actions">
            <button className="ghost small" type="button" onClick={() => addManualRow(section, 'server')}>
              + Параметр
            </button>
          </div>
        </div>
      );
    }

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
            {rows.map((row, index) => (
              <tr
                key={`${row.field}-${row.clientField ?? 'server'}-${index}`}
                className={rowHasMismatch(row, duplicateFieldSet, duplicateClientFieldSet) ? 'mismatch-row' : undefined}
              >
                <td>{renderEditableFieldCell(section, row)}</td>
                <td className="mono">{row.type}</td>
                <td>{row.required}</td>
                <td>{row.description || '—'}</td>
                <td className="mono">{row.example || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function rowHasMismatch(row: ParsedRow, duplicateFieldSet: Set<string>, duplicateClientFieldSet: Set<string>): boolean {
    const clientSourceField = row.clientSourceField?.trim();
    const serverMismatch =
      Boolean(row.field.trim()) &&
      (row.origin === 'manual' || (row.origin === 'parsed' && row.sourceField && row.field !== row.sourceField));
    const clientMismatch =
      Boolean(row.field.trim()) &&
      (row.clientOrigin === 'manual' || (row.clientOrigin === 'parsed' && row.clientSourceField && row.clientField && row.clientField !== row.clientSourceField));
    const serverDuplicate = Boolean(row.field.trim()) && duplicateFieldSet.has(row.field.trim());
    const clientDuplicate = clientSourceField ? duplicateClientFieldSet.has(clientSourceField) : false;

    return Boolean(serverMismatch || clientMismatch || serverDuplicate || clientDuplicate);
  }

  function renderSourceAlert(
    alertKey: string,
    visible: boolean,
    rows: ParsedRow[],
    duplicateValues: string[],
    duplicateLabel: string,
    formatDrift: boolean,
    currentFormat: ParseFormat,
    onFix: () => void,
    syncedFormat?: ParseFormat,
    message = 'Параметры отличаются от исходного источника'
  ): ReactNode {
    if (!visible) return null;

    const driftRows = getInputDriftRows(rows);
    const canFix = driftRows.length > 0 || formatDrift;
    const expanded = expandedDriftAlerts[alertKey] ?? false;
    const driftItems = driftRows.map((row) => (row.sourceField && row.field !== row.sourceField ? `${row.sourceField} -> ${row.field}` : row.field));
    const duplicateItems = duplicateValues.map((value) => `${duplicateLabel}: ${value}`);
    const allItems = [...driftItems, ...duplicateItems];
    const visibleRows = expanded ? allItems : allItems.slice(0, 3);

    return (
      <div className="sync-alert" role="status">
        <div className="sync-alert-title">{message}</div>
        {formatDrift && syncedFormat && (
          <div className="sync-alert-item">{`Формат: ${syncedFormat.toUpperCase()} -> ${currentFormat.toUpperCase()}`}</div>
        )}
        <div className="sync-alert-list">
          {visibleRows.map((item) => (
            <div key={item} className="sync-alert-item">
              {item}
            </div>
          ))}
        </div>
        {allItems.length > 3 && (
          <button
            className="ghost small"
            type="button"
            onClick={() => setExpandedDriftAlerts((current) => ({ ...current, [alertKey]: !expanded }))}
          >
            {expanded ? 'Свернуть' : `Показать еще ${allItems.length - 3}`}
          </button>
        )}
        {canFix && (
          <button className="ghost small" type="button" onClick={onFix}>
            Исправить источник
          </button>
        )}
      </div>
    );
  }

  function renderRequestEditor(section: ParsedSection) {
    const rows = getSectionRows(section);
    const serverLabel = getSectionSideLabel(section, 'server');
    const clientLabel = getSectionSideLabel(section, 'client');
    return (
      <div className="stack">
        <label className="switch">
          <input
            type="checkbox"
            checked={Boolean(section.domainModelEnabled)}
            onChange={(e) =>
              updateSection(section.id, (current) => {
                if (current.kind !== 'parsed' || !isDualModelSection(current)) return current;
                if (e.target.checked) {
                  return {
                    ...current,
                    domainModelEnabled: true,
                    clientFormat: current.clientFormat ?? 'json',
                    clientInput: current.clientInput ?? '',
                    clientRows: current.clientRows ?? [],
                    clientError: current.clientError ?? '',
                    clientMappings: current.clientMappings ?? {}
                  };
                }

                return {
                  ...current,
                  domainModelEnabled: false,
                  clientFormat: 'json',
                  clientInput: '',
                  clientRows: [],
                  clientError: '',
                  clientMappings: {}
                };
              })
            }
          />
          <span>Доменная модель</span>
        </label>

        <details className="expander" open>
          <summary className="expander-summary">{serverLabel}</summary>
          <div className="expander-body">
            <div className="row gap">
              <label className="field">
                <div className="label">Формат</div>
                <select
                  value={section.format}
                  onChange={(e) =>
                    updateSection(section.id, (current) =>
                      current.kind === 'parsed'
                        ? { ...current, format: e.target.value as ParseFormat, error: '' }
                        : current
                    )
                  }
                >
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                  <option value="curl">cURL</option>
                </select>
              </label>
              <button className="primary" type="button" onClick={() => runParser(section, 'server')}>
                Парсить
              </button>
            </div>

            <label className="field">
              <div className="label">Исходные данные</div>
              <textarea
                rows={12}
                value={section.input}
                onChange={(e) =>
                  updateSection(section.id, (current) =>
                    current.kind === 'parsed' ? { ...current, input: e.target.value, error: '' } : current
                  )
                }
                placeholder="Вставьте JSON, XML или cURL"
              />
            </label>
          </div>
        </details>

        {section.domainModelEnabled && (
          <details className="expander" open>
            <summary className="expander-summary">{clientLabel}</summary>
            <div className="expander-body">
              <div className="row gap">
                <label className="field">
                  <div className="label">Формат</div>
                  <select
                    value={section.clientFormat ?? 'json'}
                    onChange={(e) =>
                      updateSection(section.id, (current) =>
                        current.kind === 'parsed' && isDualModelSection(current)
                          ? { ...current, clientFormat: e.target.value as ParseFormat, clientError: '' }
                          : current
                      )
                    }
                  >
                    <option value="json">JSON</option>
                    <option value="xml">XML</option>
                    <option value="curl">cURL</option>
                  </select>
                </label>
                <button className="primary" type="button" onClick={() => runParser(section, 'client')}>
                  Парсить
                </button>
              </div>

              <label className="field">
                <div className="label">Исходные данные</div>
                <textarea
                  rows={12}
                  value={section.clientInput ?? ''}
                  onChange={(e) =>
                    updateSection(section.id, (current) =>
                      current.kind === 'parsed' && isDualModelSection(current)
                        ? { ...current, clientInput: e.target.value, clientError: '' }
                        : current
                    )
                  }
                  placeholder={`Вставьте JSON, XML или cURL для ${clientLabel.toLowerCase()}`}
                />
              </label>
            </div>
          </details>
        )}

        {section.error && <div className="alert error">{serverLabel}: {section.error}</div>}
        {section.clientError && <div className="alert error">{clientLabel}: {section.clientError}</div>}
        {!section.error && !section.clientError && validationMap.get(section.id) === '' && rows.length > 0 && (
          <div className="alert success">Распарсено {rows.length} строк</div>
        )}

        {renderParsedTable(section)}
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
          <button className="ghost" onClick={resetProject}>
            Новый
          </button>
          <label className="ghost file-input" aria-label="Импортировать проект JSON">
            Импорт
            <input type="file" accept="application/json" onChange={(e) => importProjectJson(e.target.files?.[0])} />
          </label>
          <button className="ghost" onClick={exportProjectJson}>
            Экспорт JSON
          </button>
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

      <div className="sync-alert-stack">
        {selectedSection?.kind === 'parsed' &&
          renderSourceAlert(
            `${selectedSection.id}-server`,
            selectedServerDriftRows.length > 0 || selectedServerFormatDrift || selectedServerDuplicateValues.length > 0,
            selectedSection.rows,
            selectedServerDuplicateValues,
            'Дубликат поля',
            selectedServerFormatDrift,
            selectedSection.format,
            () => syncInputFromRows(selectedSection, 'server'),
            selectedSection.lastSyncedFormat
          )}
        {selectedSection?.kind === 'parsed' &&
          isDualModelSection(selectedSection) &&
          renderSourceAlert(
            `${selectedSection.id}-client`,
            selectedClientDriftRows.length > 0 || selectedClientFormatDrift || selectedClientDuplicateValues.length > 0,
            selectedSection.clientRows ?? [],
            selectedClientDuplicateValues,
            `Дубликат ${getSectionSideLabel(selectedSection, 'client').toLowerCase()}`,
            selectedClientFormatDrift,
            selectedSection.clientFormat ?? 'json',
            () => syncInputFromRows(selectedSection, 'client'),
            selectedSection.clientLastSyncedFormat,
            `${getSectionSideLabel(selectedSection, 'client')} отличается от источника`
          )}
      </div>

      <div className="layout">
        <aside className="sidebar" role="listbox" aria-label="Секции">
          <div className="sidebar-head">
            <div className="muted">Секции</div>
            <button
              className="ghost small"
              onClick={() =>
                setSections((prev) => [...prev, { id: `custom-${Date.now()}`, title: DEFAULT_SECTION_TITLE, enabled: true, kind: 'text', value: '' }])
              }
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
                      <div className="panel-title">{renderEditableSectionTitle(selectedSection)}</div>
                      <div className="panel-sub">ID: {selectedSection.id}</div>
                    </div>
                    <div className="row gap">
                      {isCustomSection(selectedSection) && (
                        <button className="ghost small" type="button" onClick={() => deleteSection(selectedSection.id)}>
                          Удалить
                        </button>
                      )}
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={selectedSection.enabled}
                          onChange={(e) => updateSection(selectedSection.id, (current) => ({ ...current, enabled: e.target.checked }))}
                        />
                        <span>Активна</span>
                      </label>
                    </div>
                  </div>

                  {selectedSection.kind === 'text' && (
                    <div className="stack">
                      <label className="field">
                        <div className="label">Содержимое</div>
                        <textarea
                          rows={10}
                          value={selectedSection.value}
                          onChange={(e) =>
                            updateSection(selectedSection.id, (current) => (current.kind === 'text' ? { ...current, value: e.target.value } : current))
                          }
                          placeholder="Опишите цель, ограничения, ошибки и т.д."
                        />
                      </label>
                    </div>
                  )}

                  {selectedSection.kind === 'parsed' && (
                    <>
                      {isDualModelSection(selectedSection) ? (
                        renderRequestEditor(selectedSection)
                      ) : (
                        <div className="stack">
                          <div className="row gap">
                            <label className="field">
                              <div className="label">Формат</div>
                              <select
                                value={selectedSection.format}
                                onChange={(e) =>
                                  updateSection(selectedSection.id, (current) =>
                                    current.kind === 'parsed' ? { ...current, format: e.target.value as ParseFormat, error: '' } : current
                                  )
                                }
                              >
                                <option value="json">JSON</option>
                                <option value="xml">XML</option>
                                <option value="curl">cURL</option>
                              </select>
                            </label>
                            <button className="primary" type="button" onClick={() => runParser(selectedSection)}>
                              Парсить
                            </button>
                          </div>

                          <label className="field">
                            <div className="label">Исходные данные</div>
                            <textarea
                              rows={12}
                              value={selectedSection.input}
                              onChange={(e) =>
                                updateSection(selectedSection.id, (current) =>
                                  current.kind === 'parsed' ? { ...current, input: e.target.value, error: '' } : current
                                )
                              }
                              placeholder="Вставьте JSON, XML или cURL"
                            />
                          </label>
                          <div className="row gap">
                            <button className="ghost small" type="button" onClick={() => addManualRow(selectedSection)}>
                              + Параметр
                            </button>
                          </div>
                          {selectedSection.error && <div className="alert error">{selectedSection.error}</div>}
                          {!selectedSection.error && validationMap.get(selectedSection.id) === '' && selectedSection.rows.length > 0 && (
                            <div className="alert success">Распарсено {selectedSection.rows.length} строк</div>
                          )}

                          {renderParsedTable(selectedSection)}
                        </div>
                      )}
                    </>
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
                  <iframe className="preview-frame" title="HTML preview" sandbox="allow-same-origin" srcDoc={htmlOutput} />
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

