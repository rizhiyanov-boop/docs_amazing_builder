import { useMemo, useState, type ReactNode } from 'react';
import type { MethodDocument, RequestMethod } from '../../types';
import { HttpChip, WBButton } from '../primitives/WorkbenchPrimitives';

type SearchPaletteProps = {
  open: boolean;
  methods: MethodDocument[];
  getMethodHttpMethod: (method: MethodDocument) => RequestMethod;
  onClose: () => void;
  onSelectMethod: (method: MethodDocument) => void;
  onCreateMethod: () => void;
};

export function SearchPalette({ open, methods, getMethodHttpMethod, onClose, onSelectMethod, onCreateMethod }: SearchPaletteProps): ReactNode {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return methods.slice(0, 8);
    return methods.filter((method) => method.name.toLowerCase().includes(normalized)).slice(0, 12);
  }, [methods, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Поиск"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(44, 33, 19, 0.4)',
        backdropFilter: 'blur(6px)',
        paddingTop: 80,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start'
      }}
    >
      <div style={{ width: 620, maxWidth: 'calc(100vw - 32px)', background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius-lg)', boxShadow: 'var(--wb-shadow-pop)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--wb-border-soft)' }}>
          <span style={{ color: 'var(--wb-text-muted)' }}>⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Enter' && results[0]) {
                onSelectMethod(results[0]);
                onClose();
              }
            }}
            placeholder="Методы и действия"
            style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)', fontSize: 15 }}
          />
          <kbd style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 11, color: 'var(--wb-text-muted)', background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', borderRadius: 4, padding: '2px 5px' }}>Esc</kbd>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
          {results.map((method) => (
            <button
              key={method.id}
              type="button"
              onClick={() => {
                onSelectMethod(method);
                onClose();
              }}
              style={{ width: '100%', border: 0, background: 'transparent', borderRadius: 'var(--wb-radius-sm)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)', textAlign: 'left' }}
            >
              <HttpChip method={getMethodHttpMethod(method)} size="sm" />
              <span style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 13, fontWeight: 600 }}>{method.name}</span>
            </button>
          ))}
          {results.length === 0 && <div style={{ padding: 18, color: 'var(--wb-text-muted)', fontSize: 13 }}>Ничего не найдено</div>}
        </div>
        <div style={{ borderTop: '1px solid var(--wb-border-soft)', background: 'var(--wb-bg-soft)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--wb-text-muted)', fontSize: 12 }}>
          <span>↑↓ навигация</span>
          <span>↵ открыть</span>
          <span style={{ flex: 1 }} />
          <WBButton size="sm" variant="ghost" onClick={onCreateMethod}>+ Метод</WBButton>
        </div>
      </div>
    </div>
  );
}
