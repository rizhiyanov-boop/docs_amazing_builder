import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import type { RequestMethod } from '../../types';

type Accent = 'get' | 'post' | 'put' | 'del' | 'patch';

const HTTP_STYLES: Record<RequestMethod, { bg: string; fg: string }> = {
  GET: { bg: 'var(--wb-get-bg)', fg: 'var(--wb-get-fg)' },
  POST: { bg: 'var(--wb-post-bg)', fg: 'var(--wb-post-fg)' },
  PUT: { bg: 'var(--wb-put-bg)', fg: 'var(--wb-put-fg)' },
  PATCH: { bg: 'var(--wb-patch-bg)', fg: 'var(--wb-patch-fg)' },
  DELETE: { bg: 'var(--wb-del-bg)', fg: 'var(--wb-del-fg)' }
};

export function httpMethodToAccent(method: RequestMethod | string | null | undefined): Accent {
  const normalized = String(method ?? '').toUpperCase();
  if (normalized === 'GET') return 'get';
  if (normalized === 'PUT') return 'put';
  if (normalized === 'PATCH') return 'patch';
  if (normalized === 'DELETE') return 'del';
  return 'post';
}

export function HttpChip({ method = 'POST', size = 'md' }: { method?: RequestMethod | string; size?: 'sm' | 'md' }): ReactNode {
  const normalized = String(method || 'POST').toUpperCase() as RequestMethod;
  const colors = HTTP_STYLES[normalized] ?? HTTP_STYLES.POST;
  const compact = size === 'sm';
  return (
    <span
      className="wb-http-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: colors.bg,
        color: colors.fg,
        fontFamily: 'var(--wb-font-mono)',
        fontWeight: 600,
        fontSize: compact ? 10 : 11,
        letterSpacing: '0.04em',
        padding: compact ? '2px 5px' : '2px 7px',
        borderRadius: 4,
        lineHeight: 1.35,
        whiteSpace: 'nowrap'
      }}
    >
      {normalized}
    </span>
  );
}

export function TypeChip({ type }: { type: string }): ReactNode {
  return (
    <span
      style={{
        fontFamily: 'var(--wb-font-mono)',
        fontSize: 11,
        color: 'var(--wb-text-soft)',
        background: 'var(--wb-bg-soft)',
        border: '1px solid var(--wb-border-soft)',
        borderRadius: 3,
        padding: '1px 6px'
      }}
    >
      {type || 'string'}
    </span>
  );
}

export function ReqDot({ required }: { required: boolean }): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: required ? 'var(--wb-required)' : 'var(--wb-optional)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: required ? 'var(--wb-required)' : 'var(--wb-text-muted)' }} />
      {required ? 'обязательное' : 'опциональное'}
    </span>
  );
}

type WBButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  fullWidth?: boolean;
};

export function WBButton({ variant = 'secondary', size = 'md', icon, children, fullWidth, style, ...props }: WBButtonProps): ReactNode {
  const palette = {
    primary: { bg: 'var(--wb-text)', fg: 'var(--wb-bg-surface)', border: 'var(--wb-text)' },
    secondary: { bg: 'var(--wb-bg-surface)', fg: 'var(--wb-text)', border: 'var(--wb-border-strong)' },
    ghost: { bg: 'transparent', fg: 'var(--wb-text-soft)', border: 'transparent' },
    accent: { bg: 'var(--wb-accent)', fg: 'var(--wb-accent-fg)', border: 'var(--wb-accent)' },
    danger: { bg: 'var(--wb-bg-surface)', fg: 'var(--wb-required)', border: 'var(--wb-border-strong)' }
  }[variant];
  const sizing = { sm: { padding: '4px 10px', fontSize: 12 }, md: { padding: '6px 12px', fontSize: 13 }, lg: { padding: '8px 16px', fontSize: 14 } }[size];

  return (
    <button
      type="button"
      {...props}
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        padding: sizing.padding,
        fontSize: sizing.fontSize,
        fontWeight: 500,
        borderRadius: 6,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: 'var(--wb-font-sans)',
        whiteSpace: 'nowrap',
        opacity: props.disabled ? 0.55 : 1,
        width: fullWidth ? '100%' : undefined,
        ...style
      }}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}

type WBInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function WBInput({ label, error, style, ...props }: WBInputProps): ReactNode {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--wb-font-sans)' }}>
      {label && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--wb-text-soft)' }}>{label}</span>}
      <input
        {...props}
        style={{
          background: 'var(--wb-bg-soft)',
          border: `1px solid ${error ? 'var(--wb-required)' : 'var(--wb-border)'}`,
          borderRadius: 'var(--wb-radius)',
          padding: '8px 12px',
          fontSize: 14,
          color: 'var(--wb-text)',
          fontFamily: 'var(--wb-font-sans)',
          outline: 'none',
          ...style
        }}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--wb-required)' }}>{error}</span>}
    </label>
  );
}

type SidebarItemProps = {
  depth?: number;
  emoji?: ReactNode;
  http?: RequestMethod | string | null;
  children: ReactNode;
  active?: boolean;
  dim?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onClick?: () => void;
};

export function SidebarItem({ depth = 0, emoji, http, children, active, dim, expandable, expanded, onClick }: SidebarItemProps): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 'calc(100% - 8px)',
        padding: `5px 10px 5px ${10 + depth * 14}px`,
        fontSize: 13,
        color: dim ? 'var(--wb-text-muted)' : 'var(--wb-text)',
        background: active ? 'var(--wb-bg-active)' : 'transparent',
        borderRadius: 'var(--wb-radius-sm)',
        margin: '0 4px',
        border: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        fontFamily: 'var(--wb-font-sans)',
        textAlign: 'left'
      }}
    >
      {expandable && <span style={{ fontSize: 9, color: 'var(--wb-text-muted)', width: 10 }}>{expanded ? '▾' : '▸'}</span>}
      {!expandable && depth > 0 && <span style={{ width: 10 }} />}
      {emoji && <span style={{ fontSize: 14 }}>{emoji}</span>}
      {http && <HttpChip method={http} size="sm" />}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </button>
  );
}

type TabPillProps<T extends string> = {
  value: T;
  active: boolean;
  onSelect: (value: T) => void;
  children: ReactNode;
};

export function TabPill<T extends string>({ value, active, onSelect, children }: TabPillProps<T>): ReactNode {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      style={{
        border: 0,
        padding: '4px 10px',
        borderRadius: 5,
        cursor: 'pointer',
        background: active ? 'var(--wb-bg-surface)' : 'transparent',
        color: active ? 'var(--wb-text)' : 'var(--wb-text-soft)',
        fontWeight: active ? 600 : 500,
        fontSize: 12,
        fontFamily: 'var(--wb-font-sans)',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.04)' : 'none'
      }}
    >
      {children}
    </button>
  );
}

export function TabsPill({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--wb-bg-soft)',
        border: '1px solid var(--wb-border-soft)',
        borderRadius: 7,
        padding: 2,
        gap: 2
      }}
    >
      {children}
    </div>
  );
}

export function AiTableButton({ kind, onClick }: { kind: 'fill' | 'json' | 'fromex'; onClick?: () => void }): ReactNode {
  const labels = {
    fill: 'Заполнить',
    json: '{ } JSON',
    fromex: 'Из примера'
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: '1px solid var(--wb-border-soft)',
        background: 'var(--wb-violet-soft)',
        color: 'var(--wb-violet)',
        borderRadius: 5,
        padding: '3px 7px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'var(--wb-font-sans)'
      }}
    >
      {labels[kind]}
    </button>
  );
}
