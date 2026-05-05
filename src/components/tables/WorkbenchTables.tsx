import type { ReactNode } from 'react';
import type { ParsedRow } from '../../types';
import { ReqDot, TypeChip } from '../primitives/WorkbenchPrimitives';

type TableProps = {
  rows: ParsedRow[];
};

function isRequired(value: string): boolean {
  return value === 'Да' || value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'required';
}

export function TableClassic({ rows }: TableProps): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 0, border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius)', overflow: 'hidden' }}>
      {rows.map((row) => (
        <div
          key={row.id ?? row.field}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(120px, 1.5fr) 90px minmax(160px, 1fr) 28px',
            gap: 8,
            alignItems: 'start',
            padding: '8px 10px',
            borderBottom: '1px solid var(--wb-border-soft)',
            background: 'var(--wb-bg-surface)'
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <code style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 12.5, fontWeight: 500, color: 'var(--wb-text)', overflowWrap: 'anywhere' }}>
                {row.field || row.sourceField || 'field'}
              </code>
            </div>
            <ReqDot required={isRequired(row.required)} />
          </div>
          <TypeChip type={row.type} />
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: row.description ? 'var(--wb-text-soft)' : 'var(--wb-text-muted)' }}>
            {row.description || 'Описание не заполнено'}
          </div>
          <button type="button" style={{ border: 0, background: 'transparent', color: 'var(--wb-text-muted)', cursor: 'pointer', fontSize: 16 }}>⋯</button>
        </div>
      ))}
      {rows.length === 0 && <div style={{ padding: 14, color: 'var(--wb-text-muted)', fontSize: 13 }}>Поля не добавлены.</div>}
    </div>
  );
}

export function TableGallery({ rows }: TableProps): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row) => (
        <div key={row.id ?? row.field} style={{ background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius)', padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <code style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 13, fontWeight: 600 }}>{row.field || row.sourceField || 'field'}</code>
            <TypeChip type={row.type} />
            <ReqDot required={isRequired(row.required)} />
          </div>
          <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: 'var(--wb-text-soft)' }}>{row.description || 'Описание не заполнено'}</div>
        </div>
      ))}
    </div>
  );
}

export function TableMiniCards({ rows }: TableProps): ReactNode {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
      {rows.map((row) => (
        <div key={row.id ?? row.field} style={{ background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius)', padding: 10 }}>
          <code style={{ display: 'block', fontFamily: 'var(--wb-font-mono)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{row.field || row.sourceField || 'field'}</code>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <TypeChip type={row.type} />
            <ReqDot required={isRequired(row.required)} />
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--wb-text-soft)' }}>{row.description || 'Описание не заполнено'}</div>
        </div>
      ))}
    </div>
  );
}
