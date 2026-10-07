import type { ReactNode } from 'react';
import { WBButton } from '../primitives/WorkbenchPrimitives';
import { AiRequestProgress } from '../AiRequestProgress';

type AiLoadingCardProps = {
  message?: string;
  onCancel?: () => void;
};

export function AiLoadingCard({ message = 'ИИ заполняет описания полей…', onCancel }: AiLoadingCardProps): ReactNode {
  return (
    <div className="ai-loading-card">
      <div className="ai-request-progress">
        <AiRequestProgress message={message} announce={false} />
        {onCancel && <WBButton variant="ghost" size="sm" onClick={onCancel} style={{ marginLeft: 'auto' }}>Отмена</WBButton>}
      </div>
      {[0, 1, 2].map((item) => (
        <div key={item} className="ai-loading-placeholder" />
      ))}
    </div>
  );
}
