import type { ReactNode } from 'react';
import { WBButton } from '../primitives/WorkbenchPrimitives';

type AiLoadingCardProps = {
  message?: string;
  processed?: number;
  total?: number;
  onCancel?: () => void;
};

export function AiLoadingCard({ message = 'AI заполняет описания полей...', processed = 0, total = 0, onCancel }: AiLoadingCardProps): ReactNode {
  return (
    <div style={{ display: 'grid', gap: 10, padding: '6px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--wb-text)' }}>
        <span className="ai-loader" aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{message}</div>
          <div style={{ fontSize: 12, color: 'var(--wb-text-muted)' }}>
            {total > 0 ? `обработано ${processed} из ${total}` : 'можно отменить'}
          </div>
        </div>
        {onCancel && <WBButton variant="ghost" size="sm" onClick={onCancel} style={{ marginLeft: 'auto' }}>Отмена</WBButton>}
      </div>
      {[0, 1, 2].map((item) => (
        <div key={item} style={{ height: 32, borderRadius: 'var(--wb-radius-sm)', background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', opacity: 0.75 }} />
      ))}
    </div>
  );
}
