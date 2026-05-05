import type { ReactNode } from 'react';

type ToastProps = {
  message: string;
  kind?: 'success' | 'error' | 'ai';
};

export function Toast({ message, kind = 'success' }: ToastProps): ReactNode {
  if (!message) return null;
  const accent = kind === 'error' ? 'var(--wb-required)' : kind === 'ai' ? 'var(--wb-violet)' : 'var(--wb-accent)';
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
