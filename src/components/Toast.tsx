import type { ReactNode } from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error' | 'ai';

type ToastProps = {
  message: string;
  kind?: ToastKind;
};

export function Toast({ message, kind = 'info' }: ToastProps): ReactNode {
  if (!message) return null;
  const accent = {
    info: 'var(--wb-text-muted)',
    success: 'var(--wb-success)',
    warning: 'var(--wb-warning)',
    error: 'var(--wb-danger)',
    ai: 'var(--wb-violet)'
  }[kind];
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 18,
        bottom: 18,
        zIndex: 160,
        maxWidth: 360,
        background: 'var(--wb-bg-surface)',
        color: 'var(--wb-text)',
        border: '1px solid var(--wb-border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 'var(--wb-radius)',
        boxShadow: 'var(--wb-shadow-pop)',
        padding: '10px 12px',
        fontSize: 13,
        fontFamily: 'var(--wb-font-sans)'
      }}
    >
      {message}
    </div>
  );
}
