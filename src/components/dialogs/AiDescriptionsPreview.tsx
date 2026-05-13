import type { ReactNode } from 'react';

export type AiDescriptionSuggestion = {
  field: string;
  description: string;
  accepted: boolean;
  locked?: boolean;
};

type AiDescriptionsPreviewProps = {
  suggestions: AiDescriptionSuggestion[];
  onToggle: (field: string, accepted: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  applyLabel?: string;
  lockedHint?: string;
};

export function AiDescriptionsPreview({
  suggestions,
  onToggle,
  onSelectAll,
  onSelectNone,
  onConfirm,
  onCancel,
  title = 'AI предлагает значения',
  applyLabel = 'Применить',
  lockedHint = 'Уже заполнено — не изменяется'
}: AiDescriptionsPreviewProps): ReactNode {
  const selectedCount = suggestions.filter((item) => item.accepted && !item.locked).length;

  return (
    <div className="import-routing-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="import-routing-card">
        <h2>{title} ({suggestions.length})</h2>
        <div style={{ display: 'grid', gap: 8, maxHeight: 340, overflowY: 'auto', marginTop: 8 }}>
          {suggestions.map((item) => (
            <label
              key={item.field}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px minmax(120px, 180px) 1fr',
                gap: 8,
                alignItems: 'start',
                padding: '6px 8px',
                border: '1px solid var(--wb-border-soft)',
                borderRadius: 6,
                background: item.locked ? 'var(--wb-bg-soft)' : 'var(--wb-bg-surface)',
                opacity: item.locked ? 0.75 : 1
              }}
            >
              <input
                type="checkbox"
                checked={item.accepted}
                disabled={Boolean(item.locked)}
                onChange={(event) => onToggle(item.field, event.target.checked)}
              />
              <code style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 12 }}>{item.field}</code>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: item.locked ? 'var(--wb-text-muted)' : 'var(--wb-text-soft)' }}>
                {item.description}
                {item.locked && <div style={{ marginTop: 3, fontSize: 11 }}>{lockedHint}</div>}
              </div>
            </label>
          ))}
        </div>

        <div className="import-routing-actions" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="ghost" onClick={onSelectAll}>Выбрать все</button>
            <button type="button" className="ghost" onClick={onSelectNone}>Снять все</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="ghost" onClick={onCancel}>Отмена</button>
            <button type="button" onClick={onConfirm} disabled={selectedCount === 0}>{applyLabel} {selectedCount}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
