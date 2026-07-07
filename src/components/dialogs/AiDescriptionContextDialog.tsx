import type { KeyboardEvent, ReactNode } from 'react';

export const AI_DESCRIPTION_CONTEXT_MAX_LENGTH = 20_000;

type AiDescriptionContextDialogProps = {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AiDescriptionContextDialog({
  value,
  onChange,
  onConfirm,
  onCancel
}: AiDescriptionContextDialogProps): ReactNode {
  const isTooLong = value.length > AI_DESCRIPTION_CONTEXT_MAX_LENGTH;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      className="import-routing-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="AI context for descriptions"
      onKeyDown={handleKeyDown}
    >
      <div className="import-routing-card">
        <h2>Контекст для AI-описаний</h2>
        <label className="label input-label-strong" htmlFor="ai-description-context">
          Дополнительный контекст для AI
        </label>
        <textarea
          id="ai-description-context"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={8}
          style={{
            width: '100%',
            minHeight: 180,
            maxHeight: 360,
            resize: 'vertical',
            marginTop: 8
          }}
          autoFocus
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: 8,
            color: isTooLong ? 'var(--wb-danger)' : 'var(--wb-text-muted)',
            fontSize: 12
          }}
        >
          <span>{isTooLong ? 'Сократите контекст перед запуском AI' : 'Можно оставить пустым'}</span>
          <span>{value.length} / {AI_DESCRIPTION_CONTEXT_MAX_LENGTH}</span>
        </div>

        <div className="import-routing-actions">
          <button type="button" className="ghost" onClick={onCancel}>Отмена</button>
          <button type="button" onClick={onConfirm} disabled={isTooLong}>Запустить AI</button>
        </div>
      </div>
    </div>
  );
}
