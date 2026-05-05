import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

type CardProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  emoji?: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  accent?: 'get' | 'post' | 'put' | 'del' | 'patch';
  draggableHandle?: boolean;
  children: ReactNode;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { emoji, title, eyebrow, actions, accent, draggableHandle = true, children, style, ...props },
  ref
): ReactNode {
  const accentVar = accent === 'del' ? 'del' : accent;
  const borderColor = accentVar ? `var(--wb-${accentVar}, var(--wb-border))` : 'var(--wb-border)';
  return (
    <div
      {...props}
      ref={ref}
      style={{
        background: 'var(--wb-bg-surface)',
        borderRadius: 'var(--wb-radius-lg)',
        boxShadow: 'var(--wb-shadow-card)',
        overflow: 'hidden',
        position: 'relative',
        borderTop: accent ? `3px solid ${borderColor}` : undefined,
        color: 'var(--wb-text)',
        ...style
      }}
    >
      {(emoji || title || actions) && (
        <div style={{ padding: '14px 16px 8px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {draggableHandle && (
            <span
              style={{
                position: 'absolute',
                left: 4,
                top: 14,
                color: 'var(--wb-text-muted)',
                fontSize: 14,
                cursor: 'grab',
                opacity: 0.5,
                lineHeight: 1,
                userSelect: 'none'
              }}
              aria-hidden="true"
            >
              ⋮⋮
            </span>
          )}
          {emoji && <span style={{ fontSize: 18, lineHeight: 1.2 }}>{emoji}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--wb-text-muted)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 2
                }}
              >
                {eyebrow}
              </div>
            )}
            {title && (
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}>
                {title}
              </div>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: '4px 16px 14px' }}>{children}</div>
    </div>
  );
});
