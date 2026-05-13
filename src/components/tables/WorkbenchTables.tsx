import { useRef, useState, type ReactNode } from 'react';
import type { ParsedRow } from '../../types';
import { ReqDot, TypeChip } from '../primitives/WorkbenchPrimitives';
import { isRequired } from './WorkbenchTables.utils';

const ROW_TYPES = [
  { value: 'string', label: 'string' },
  { value: 'int', label: 'int' },
  { value: 'long', label: 'long' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'object', label: 'object' },
  { value: 'array', label: 'array' },
  { value: 'array_object', label: 'array{}' },
  { value: 'null', label: 'null' },
  { value: 'map', label: 'map' }
] as const;

type TableProps = {
  rows: ParsedRow[];
  onUpdateRow?: (row: ParsedRow, patch: Partial<ParsedRow>) => void;
  onAddRow?: (fieldName?: string, fieldType?: string) => void;
  onRowMenu?: (row: ParsedRow) => void;
  editable?: boolean;
};

function moveFocus(current: HTMLElement, direction: 'next' | 'prev'): void {
  const scope = current.closest('.wb-table-focus-scope');
  if (!scope) return;
  const focusables = Array.from(scope.querySelectorAll<HTMLElement>('[data-table-focusable="true"]'));
  const currentIndex = focusables.indexOf(current);
  if (currentIndex < 0) return;
  const next = direction === 'next' ? focusables[currentIndex + 1] : focusables[currentIndex - 1];
  next?.focus();
}

function groupRowsByPrefix(rows: ParsedRow[]): Array<{ prefix: string | null; rows: ParsedRow[] }> {
  const groups: Array<{ prefix: string | null; rows: ParsedRow[] }> = [];
  let currentPrefix: string | null = null;
  let currentGroup: ParsedRow[] = [];

  for (const row of rows) {
    const dotIndex = row.field.indexOf('.');
    const prefix = dotIndex > 0 ? row.field.slice(0, dotIndex) : null;

    if (prefix !== currentPrefix) {
      if (currentGroup.length > 0) groups.push({ prefix: currentPrefix, rows: currentGroup });
      currentPrefix = prefix;
      currentGroup = [row];
    } else {
      currentGroup.push(row);
    }
  }

  if (currentGroup.length > 0) groups.push({ prefix: currentPrefix, rows: currentGroup });
  return groups;
}

function getRowCopyText(row: ParsedRow): string {
  if (row.example?.trim()) return row.example.trim();
  return JSON.stringify({
    field: row.field || row.sourceField || '',
    type: row.type || 'string',
    required: row.required || '',
    description: row.description || ''
  }, null, 2);
}

function copyRow(row: ParsedRow): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    void navigator.clipboard.writeText(getRowCopyText(row));
  }
}

function getTypeAccent(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized.includes('array') || normalized.endsWith('[]')) return 'var(--wb-table-type-array)';
  if (normalized.includes('object') || normalized.includes('map')) return 'var(--wb-table-type-object)';
  if (normalized.includes('bool')) return 'var(--wb-table-type-boolean)';
  if (normalized.includes('int') || normalized.includes('long') || normalized.includes('number') || normalized.includes('float') || normalized.includes('double')) {
    return 'var(--wb-table-type-number)';
  }
  if (normalized.includes('null')) return 'var(--wb-table-type-null)';
  return 'var(--wb-table-type-string)';
}

function FieldInput({ row, onUpdateRow }: { row: ParsedRow; onUpdateRow?: (row: ParsedRow, patch: Partial<ParsedRow>) => void }): ReactNode {
  return (
    <input
      value={row.field || row.sourceField || ''}
      onChange={(event) => onUpdateRow?.(row, { field: event.target.value, sourceField: event.target.value })}
      onKeyDown={(event) => {
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          moveFocus(event.currentTarget, 'next');
          return;
        }
        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          moveFocus(event.currentTarget, 'prev');
        }
      }}
      aria-label="Имя поля"
      data-table-focusable="true"
      style={{
        width: '100%',
        border: '1px solid var(--wb-border-soft)',
        background: 'var(--wb-bg-surface)',
        color: 'var(--wb-text)',
        borderRadius: 5,
        padding: '4px 6px',
        fontFamily: 'var(--wb-font-mono)',
        fontSize: 12.5,
        fontWeight: 600
      }}
    />
  );
}

function DescriptionInput({
  row,
  onUpdateRow,
  rows = 2
}: {
  row: ParsedRow;
  onUpdateRow?: (row: ParsedRow, patch: Partial<ParsedRow>) => void;
  rows?: number;
}): ReactNode {
  return (
    <textarea
      value={row.description}
      onChange={(event) => onUpdateRow?.(row, { description: event.target.value })}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.currentTarget.blur();
          return;
        }
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          moveFocus(event.currentTarget, 'next');
          return;
        }
        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          moveFocus(event.currentTarget, 'prev');
        }
      }}
      rows={rows}
      aria-label="Описание поля"
      data-table-focusable="true"
      style={{
        width: '100%',
        resize: 'vertical',
        border: '1px solid var(--wb-border-soft)',
        background: 'var(--wb-bg-soft)',
        color: 'var(--wb-text)',
        borderRadius: 5,
        padding: '4px 6px',
        fontFamily: 'var(--wb-font-sans)',
        fontSize: 12.5,
        lineHeight: 1.45
      }}
    />
  );
}

function TypeSelect({ row, onUpdateRow }: { row: ParsedRow; onUpdateRow?: (row: ParsedRow, patch: Partial<ParsedRow>) => void }): ReactNode {
  if (!onUpdateRow) return <TypeChip type={row.type} />;

  return (
    <select
      value={row.type || 'string'}
      onChange={(event) => onUpdateRow(row, { type: event.target.value })}
      onKeyDown={(event) => {
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          moveFocus(event.currentTarget, 'next');
          return;
        }
        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          moveFocus(event.currentTarget, 'prev');
        }
      }}
      aria-label="Тип поля"
      data-table-focusable="true"
      style={{
        fontFamily: 'var(--wb-font-mono)',
        fontSize: 11,
        color: 'var(--wb-text-soft)',
        background: 'var(--wb-bg-soft)',
        border: '1px solid var(--wb-border-soft)',
        borderRadius: 3,
        padding: '1px 4px',
        cursor: 'pointer',
        width: '100%'
      }}
    >
      {ROW_TYPES.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function AddRowInline({ onAdd }: { onAdd?: (fieldName?: string, fieldType?: string) => void }): ReactNode {
  const [field, setField] = useState('');
  const [type, setType] = useState('string');
  const inputRef = useRef<HTMLInputElement | null>(null);

  function commit(): void {
    const trimmed = field.trim();
    if (!trimmed || !onAdd) return;
    onAdd(trimmed, type);
    setField('');
    setType('string');
    inputRef.current?.focus();
  }

  return (
    <div
      className="wb-table-classic-row"
      style={{
        borderTop: '1px solid var(--wb-border-soft)',
        background: 'var(--wb-bg-soft)',
        padding: '6px 10px',
        gap: 8,
        alignItems: 'center'
      }}
    >
      <input
        ref={inputRef}
        value={field}
        placeholder="имя_поля"
        onChange={(event) => setField(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setField('');
            setType('string');
            return;
          }
          if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            moveFocus(event.currentTarget, 'next');
            return;
          }
          if (event.key === 'Tab' && event.shiftKey) {
            event.preventDefault();
            moveFocus(event.currentTarget, 'prev');
          }
        }}
        aria-label="Новое поле"
        data-table-focusable="true"
        style={{
          fontFamily: 'var(--wb-font-mono)',
          fontSize: 12.5,
          border: '1px solid var(--wb-border)',
          background: 'var(--wb-bg-surface)',
          color: 'var(--wb-text)',
          borderRadius: 4,
          padding: '3px 6px',
          width: '100%'
        }}
      />
      <select
        value={type}
        onChange={(event) => setType(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            moveFocus(event.currentTarget, 'next');
            return;
          }
          if (event.key === 'Tab' && event.shiftKey) {
            event.preventDefault();
            moveFocus(event.currentTarget, 'prev');
          }
        }}
        aria-label="Тип нового поля"
        data-table-focusable="true"
        style={{
          fontFamily: 'var(--wb-font-mono)',
          fontSize: 11,
          border: '1px solid var(--wb-border-soft)',
          background: 'var(--wb-bg-soft)',
          color: 'var(--wb-text-soft)',
          borderRadius: 3,
          padding: '2px 4px',
          width: 90
        }}
      >
        {ROW_TYPES.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={commit}
        disabled={!field.trim()}
        aria-label="Добавить поле"
        data-table-focusable="true"
        style={{
          background: 'var(--wb-accent)',
          color: 'var(--wb-accent-fg)',
          border: 0,
          borderRadius: 4,
          padding: '3px 10px',
          fontSize: 12,
          cursor: 'pointer',
          opacity: field.trim() ? 1 : 0.4
        }}
      >
        ↵
      </button>
    </div>
  );
}

function GroupHeader({ prefix, withTopGap }: { prefix: string; withTopGap?: boolean }): ReactNode {
  return (
    <div
      style={{
        padding: '4px 10px',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--wb-text-muted)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: 'var(--wb-bg-soft)',
        borderBottom: '1px solid var(--wb-border-soft)',
        borderTop: withTopGap ? '1px solid var(--wb-border-soft)' : undefined,
        marginTop: withTopGap ? 4 : 0
      }}
    >
      {prefix}
    </div>
  );
}

export function TableClassic({ rows, onUpdateRow, onAddRow, onRowMenu, editable = false }: TableProps): ReactNode {
  const groups = rows.length > 8 ? groupRowsByPrefix(rows) : [{ prefix: null as string | null, rows }];

  return (
    <div className="wb-table-focus-scope" style={{ display: 'grid', gap: 0, border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius)', overflow: 'hidden' }}>
      {groups.map((group, groupIndex) => (
        <div key={`classic-${group.prefix ?? 'plain'}-${groupIndex}`}>
          {group.prefix && <GroupHeader prefix={group.prefix} withTopGap={groupIndex > 0} />}
          {group.rows.map((row, rowIndex) => (
            <div
              key={row.id ?? row.field}
              className="wb-table-classic-row"
              style={{
                gap: 8,
                alignItems: 'start',
                padding: '8px 10px',
                borderBottom: '1px solid var(--wb-border-soft)',
                borderLeft: `4px solid ${getTypeAccent(row.type || 'string')}`,
                background: rowIndex % 2 === 0 ? 'var(--wb-table-stripe-even)' : 'var(--wb-table-stripe-odd)'
              }}
            >
              <div style={{ minWidth: 0 }}>
                {editable ? (
                  <FieldInput row={row} onUpdateRow={onUpdateRow} />
                ) : (
                  <code style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 12.5, fontWeight: 500, color: 'var(--wb-text)', overflowWrap: 'anywhere' }}>
                    {row.field || row.sourceField || 'field'}
                  </code>
                )}
                <ReqDot required={isRequired(row.required)} />
              </div>
              <TypeSelect row={row} onUpdateRow={onUpdateRow} />
              {editable ? (
                <DescriptionInput row={row} onUpdateRow={onUpdateRow} />
              ) : (
                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: row.description ? 'var(--wb-text-soft)' : 'var(--wb-text-muted)' }}>
                  {row.description || 'Описание не заполнено'}
                  {row.example && (
                    <code style={{ display: 'block', marginTop: 6, fontFamily: 'var(--wb-font-mono)', fontSize: 11.5, color: 'var(--wb-text)', overflowWrap: 'anywhere' }}>
                      {row.example}
                    </code>
                  )}
                </div>
              )}
              <button
                type="button"
                className="wb-table-copy-btn"
                onClick={() => copyRow(row)}
                title={row.example ? 'Скопировать пример' : 'Скопировать строку'}
                aria-label={row.example ? 'Скопировать пример' : 'Скопировать строку'}
              >
                ⧉
              </button>
              {onRowMenu && (
                <button
                  type="button"
                  onClick={() => onRowMenu(row)}
                  title="Меню строки"
                  aria-label="Меню строки"
                  style={{ border: 0, background: 'transparent', color: 'var(--wb-text-muted)', cursor: 'pointer', fontSize: 16 }}
                >
                  ⋯
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {rows.length === 0 && <div style={{ padding: 14, color: 'var(--wb-text-muted)', fontSize: 13 }}>Поля не добавлены.</div>}
      {editable && <AddRowInline onAdd={onAddRow} />}
    </div>
  );
}

export function TableGallery({ rows, onUpdateRow, onAddRow, editable = false }: TableProps): ReactNode {
  const groups = rows.length > 8 ? groupRowsByPrefix(rows) : [{ prefix: null as string | null, rows }];

  return (
    <div className="wb-table-focus-scope" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {groups.map((group, groupIndex) => (
        <div key={`gallery-${group.prefix ?? 'plain'}-${groupIndex}`}>
          {group.prefix && <GroupHeader prefix={group.prefix} withTopGap={groupIndex > 0} />}
          {group.rows.map((row) => (
            <div
              key={row.id ?? row.field}
              style={{
                background: 'var(--wb-bg-soft)',
                border: '1px solid var(--wb-border-soft)',
                borderLeft: `4px solid ${getTypeAccent(row.type || 'string')}`,
                borderRadius: 'var(--wb-radius)',
                padding: 10,
                marginBottom: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {editable ? (
                  <div style={{ minWidth: 140, flex: 1 }}>
                    <FieldInput row={row} onUpdateRow={onUpdateRow} />
                  </div>
                ) : (
                  <code style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 13, fontWeight: 600 }}>{row.field || row.sourceField || 'field'}</code>
                )}
                <TypeSelect row={row} onUpdateRow={onUpdateRow} />
                <ReqDot required={isRequired(row.required)} />
                <button
                  type="button"
                  className="wb-table-copy-btn"
                  onClick={() => copyRow(row)}
                  title={row.example ? 'Скопировать пример' : 'Скопировать строку'}
                  aria-label={row.example ? 'Скопировать пример' : 'Скопировать строку'}
                >
                  ⧉
                </button>
              </div>
              {editable ? (
                <div style={{ marginTop: 8 }}>
                  <DescriptionInput row={row} onUpdateRow={onUpdateRow} />
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: 'var(--wb-text-soft)' }}>
                  {row.description || 'Описание не заполнено'}
                  {row.example && (
                    <code style={{ display: 'block', marginTop: 6, fontFamily: 'var(--wb-font-mono)', fontSize: 11.5, color: 'var(--wb-text)', overflowWrap: 'anywhere' }}>
                      {row.example}
                    </code>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      {editable && <AddRowInline onAdd={onAddRow} />}
    </div>
  );
}

export function TableMiniCards({ rows, onUpdateRow, onAddRow, editable = false }: TableProps): ReactNode {
  return (
    <div className="wb-table-focus-scope" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
      {rows.map((row) => (
        <div
          key={row.id ?? row.field}
          style={{
            background: 'var(--wb-bg-soft)',
            border: '1px solid var(--wb-border-soft)',
            borderLeft: `4px solid ${getTypeAccent(row.type || 'string')}`,
            borderRadius: 'var(--wb-radius)',
            padding: 10
          }}
        >
          {editable ? (
            <FieldInput row={row} onUpdateRow={onUpdateRow} />
          ) : (
            <code style={{ display: 'block', fontFamily: 'var(--wb-font-mono)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{row.field || row.sourceField || 'field'}</code>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
            <TypeSelect row={row} onUpdateRow={onUpdateRow} />
            <ReqDot required={isRequired(row.required)} />
            <button
              type="button"
              className="wb-table-copy-btn"
              onClick={() => copyRow(row)}
              title={row.example ? 'Скопировать пример' : 'Скопировать строку'}
              aria-label={row.example ? 'Скопировать пример' : 'Скопировать строку'}
            >
              ⧉
            </button>
          </div>
          {editable ? (
            <DescriptionInput row={row} onUpdateRow={onUpdateRow} rows={3} />
          ) : (
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--wb-text-soft)' }}>
              {row.description || 'Описание не заполнено'}
              {row.example && (
                <code style={{ display: 'block', marginTop: 6, fontFamily: 'var(--wb-font-mono)', fontSize: 11.5, color: 'var(--wb-text)', overflowWrap: 'anywhere' }}>
                  {row.example}
                </code>
              )}
            </div>
          )}
        </div>
      ))}
      {editable && <AddRowInline onAdd={onAddRow} />}
    </div>
  );
}
