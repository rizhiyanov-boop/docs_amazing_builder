import type { ReactNode } from 'react';
import type { ParsedRow } from '../../types';
import { ReqDot, TypeChip } from '../primitives/WorkbenchPrimitives';

type TableProps = {
  rows: ParsedRow[];
  onUpdateRow?: (row: ParsedRow, patch: Partial<ParsedRow>) => void;
  onAddRow?: () => void;
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
          <TypeChip type={row.type} />
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
        <button type="button" onClick={onAddRow} style={{ border: 0, borderTop: '1px solid var(--wb-border-soft)', background: 'var(--wb-bg-soft)', color: 'var(--wb-text-soft)', padding: 9, cursor: 'pointer', fontFamily: 'var(--wb-font-sans)', fontSize: 13 }}>
          + Добавить поле
        </button>
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
            <TypeChip type={row.type} />
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
      {editable && <button type="button" onClick={onAddRow} style={{ border: '1px dashed var(--wb-border-strong)', background: 'transparent', color: 'var(--wb-text-muted)', borderRadius: 'var(--wb-radius)', padding: 10, cursor: 'pointer' }}>+ Добавить поле</button>}
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
            <TypeChip type={row.type} />
            <ReqDot required={isRequired(row.required)} />
          </div>
          {editable ? (
            <DescriptionInput row={row} onUpdateRow={onUpdateRow} rows={3} />
          ) : (
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--wb-text-soft)' }}>{row.description || 'Описание не заполнено'}</div>
          )}
        </div>
      ))}
      {editable && <button type="button" onClick={onAddRow} style={{ minHeight: 110, border: '1px dashed var(--wb-border-strong)', background: 'transparent', color: 'var(--wb-text-muted)', borderRadius: 'var(--wb-radius)', padding: 10, cursor: 'pointer' }}>+ Добавить поле</button>}
    </div>
  );
}
