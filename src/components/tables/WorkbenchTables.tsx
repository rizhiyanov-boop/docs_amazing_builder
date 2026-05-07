import { useRef, useState, type ReactNode } from 'react';
import type { ParsedRow } from '../../types';
import { ReqDot, TypeChip } from '../primitives/WorkbenchPrimitives';

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

export function isRequired(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return value === '+' || value === 'Да' || normalized === 'true' || value === '1' || normalized === 'required';
}

function FieldInput({ row, onUpdateRow }: { row: ParsedRow; onUpdateRow?: (row: ParsedRow, patch: Partial<ParsedRow>) => void }): ReactNode {
  return (
    <input
      value={row.field || row.sourceField || ''}
      onChange={(event) => onUpdateRow?.(row, { field: event.target.value, sourceField: event.target.value })}
      aria-label="Имя поля"
      style={{ width: '100%', border: '1px solid var(--wb-border-soft)', background: 'var(--wb-bg-surface)', color: 'var(--wb-text)', borderRadius: 5, padding: '4px 6px', fontFamily: 'var(--wb-font-mono)', fontSize: 12.5, fontWeight: 600 }}
    />
  );
}

function DescriptionInput({ row, onUpdateRow, rows = 2 }: { row: ParsedRow; onUpdateRow?: (row: ParsedRow, patch: Partial<ParsedRow>) => void; rows?: number }): ReactNode {
  return (
    <textarea
      value={row.description}
      onChange={(event) => onUpdateRow?.(row, { description: event.target.value })}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      rows={rows}
      aria-label="Описание поля"
      style={{ width: '100%', resize: 'vertical', border: '1px solid var(--wb-border-soft)', background: 'var(--wb-bg-soft)', color: 'var(--wb-text)', borderRadius: 5, padding: '4px 6px', fontFamily: 'var(--wb-font-sans)', fontSize: 12.5, lineHeight: 1.45 }}
    />
  );
}

function TypeSelect({
  row,
  onUpdateRow
}: {
  row: ParsedRow;
  onUpdateRow?: (row: ParsedRow, patch: Partial<ParsedRow>) => void;
}): ReactNode {
  if (!onUpdateRow) {
    return <TypeChip type={row.type} />;
  }

  return (
    <select
      value={row.type || 'string'}
      onChange={(event) => onUpdateRow(row, { type: event.target.value })}
      aria-label="Тип поля"
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

function AddRowInline({
  onAdd
}: {
  onAdd?: (fieldName?: string, fieldType?: string) => void;
}): ReactNode {
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
          }
        }}
        aria-label="Новое поле"
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
        aria-label="Тип нового поля"
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

export function TableClassic({ rows, onUpdateRow, onAddRow, onRowMenu, editable = false }: TableProps): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 0, border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius)', overflow: 'hidden' }}>
      {rows.map((row) => (
        <div
          key={row.id ?? row.field}
          className="wb-table-classic-row"
          style={{
            gap: 8,
            alignItems: 'start',
            padding: '8px 10px',
            borderBottom: '1px solid var(--wb-border-soft)',
            background: 'var(--wb-bg-surface)'
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
            </div>
          )}
          {onRowMenu && (
            <button
              type="button"
              onClick={() => onRowMenu(row)}
              style={{ border: 0, background: 'transparent', color: 'var(--wb-text-muted)', cursor: 'pointer', fontSize: 16 }}
            >
              ⋯
            </button>
          )}
        </div>
      ))}
      {rows.length === 0 && <div style={{ padding: 14, color: 'var(--wb-text-muted)', fontSize: 13 }}>Поля не добавлены.</div>}
      {editable && (
        <AddRowInline onAdd={onAddRow} />
      )}
    </div>
  );
}

export function TableGallery({ rows, onUpdateRow, onAddRow, editable = false }: TableProps): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row) => (
        <div key={row.id ?? row.field} style={{ background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius)', padding: 10 }}>
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
          </div>
          {editable ? (
            <div style={{ marginTop: 8 }}>
              <DescriptionInput row={row} onUpdateRow={onUpdateRow} />
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: 'var(--wb-text-soft)' }}>{row.description || 'Описание не заполнено'}</div>
          )}
        </div>
      ))}
      {editable && <AddRowInline onAdd={onAddRow} />}
    </div>
  );
}

export function TableMiniCards({ rows, onUpdateRow, onAddRow, editable = false }: TableProps): ReactNode {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
      {rows.map((row) => (
        <div key={row.id ?? row.field} style={{ background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius)', padding: 10 }}>
          {editable ? (
            <FieldInput row={row} onUpdateRow={onUpdateRow} />
          ) : (
            <code style={{ display: 'block', fontFamily: 'var(--wb-font-mono)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{row.field || row.sourceField || 'field'}</code>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
            <TypeSelect row={row} onUpdateRow={onUpdateRow} />
            <ReqDot required={isRequired(row.required)} />
          </div>
          {editable ? (
            <DescriptionInput row={row} onUpdateRow={onUpdateRow} rows={3} />
          ) : (
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--wb-text-soft)' }}>{row.description || 'Описание не заполнено'}</div>
          )}
        </div>
      ))}
      {editable && <AddRowInline onAdd={onAddRow} />}
    </div>
  );
}
