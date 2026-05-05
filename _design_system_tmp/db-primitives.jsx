// db-primitives.jsx — primitive building blocks for doc-builder DS

const Icon = ({ name, size = 16, color = 'currentColor', strokeWidth = 1.5, style = {} }) => (
  <i data-lucide={name} style={{ width: size, height: size, color, strokeWidth, display: 'inline-flex', flexShrink: 0, ...style }} />
);

// Trigger lucide render after mount
const useLucide = (deps = []) => {
  React.useEffect(() => {
    if (window.lucide) window.lucide.createIcons();
  }, deps);
};

const Button = ({ variant = 'secondary', size = 'md', icon, iconRight, children, onClick, disabled, loading, style = {}, fullWidth }) => {
  useLucide([icon, iconRight, children, loading]);
  const sizeMap = {
    sm: { h: 28, px: 10, fs: 13, gap: 6, ic: 14 },
    md: { h: 32, px: 12, fs: 13, gap: 6, ic: 16 },
    lg: { h: 36, px: 14, fs: 14, gap: 8, ic: 16 },
  }[size];
  const variants = {
    primary: {
      background: 'var(--color-accent-default)',
      color: 'var(--color-text-on-accent)',
      border: '1px solid var(--color-accent-default)',
    },
    secondary: {
      background: 'var(--color-bg-elevated)',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--color-border-default)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
      border: '1px solid transparent',
    },
    danger: {
      background: 'var(--color-danger-default)',
      color: '#fff',
      border: '1px solid var(--color-danger-default)',
    },
    'danger-outline': {
      background: 'transparent',
      color: 'var(--color-danger-text)',
      border: '1px solid var(--color-border-default)',
    },
    link: {
      background: 'transparent',
      color: 'var(--color-accent-text)',
      border: '1px solid transparent',
      padding: 0,
      height: 'auto',
    },
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className={`db-btn db-btn-${variant}`}
      style={{
        height: sizeMap.h,
        padding: variant === 'link' ? 0 : `0 ${sizeMap.px}px`,
        fontSize: sizeMap.fs,
        fontWeight: 500,
        gap: sizeMap.gap,
        borderRadius: 'var(--radius-md)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !loading ? 0.5 : 1,
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
        transition: 'background var(--duration-fast), border-color var(--duration-fast), color var(--duration-fast)',
        width: fullWidth ? '100%' : undefined,
        ...variants,
        ...style,
      }}
    >
      {loading ? <Spinner size={sizeMap.ic} /> : icon && <Icon name={icon} size={sizeMap.ic} />}
      {children}
      {iconRight && <Icon name={iconRight} size={sizeMap.ic} />}
    </button>
  );
};

const IconButton = ({ icon, size = 'md', variant = 'ghost', onClick, active, title, style = {} }) => {
  useLucide([icon, active]);
  const dim = { sm: 28, md: 32, lg: 36 }[size];
  const ic = { sm: 14, md: 16, lg: 18 }[size];
  const styles = active
    ? { background: 'var(--color-bg-active)', color: 'var(--color-text-primary)' }
    : variant === 'ghost'
      ? { background: 'transparent', color: 'var(--color-text-secondary)' }
      : { background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)' };
  return (
    <button onClick={onClick} title={title}
      className="db-icon-btn"
      style={{
        width: dim, height: dim,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-md)',
        border: variant === 'ghost' ? '1px solid transparent' : undefined,
        cursor: 'pointer',
        transition: 'background var(--duration-fast), color var(--duration-fast)',
        ...styles,
        ...style,
      }}>
      <Icon name={icon} size={ic} />
    </button>
  );
};

const Spinner = ({ size = 14, color = 'currentColor' }) => (
  <span style={{ width: size, height: size, display: 'inline-block', position: 'relative' }}>
    <span style={{
      position: 'absolute', inset: 0, border: `2px solid ${color}`, opacity: 0.25,
      borderRadius: '50%',
    }} />
    <span style={{
      position: 'absolute', inset: 0, border: `2px solid transparent`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'db-spin 0.7s linear infinite',
    }} />
  </span>
);

const Badge = ({ variant = 'neutral', size = 'sm', children, icon, style = {} }) => {
  useLucide([icon, children]);
  const map = {
    neutral: { bg: 'var(--color-bg-overlay)', fg: 'var(--color-text-secondary)', bd: 'var(--color-border-subtle)' },
    accent:  { bg: 'var(--color-accent-subtle)', fg: 'var(--color-accent-text)', bd: 'var(--color-accent-border)' },
    success: { bg: 'var(--color-success-subtle)', fg: 'var(--color-success-text)', bd: 'transparent' },
    warning: { bg: 'var(--color-warning-subtle)', fg: 'var(--color-warning-default)', bd: 'transparent' },
    danger:  { bg: 'var(--color-danger-subtle)', fg: 'var(--color-danger-text)', bd: 'transparent' },
    code:    { bg: 'var(--color-bg-overlay)', fg: 'var(--color-text-primary)', bd: 'var(--color-border-subtle)' },
    get:     { bg: 'var(--color-success-subtle)', fg: 'var(--color-success-text)', bd: 'transparent' },
    post:    { bg: 'var(--color-accent-subtle)', fg: 'var(--color-accent-text)', bd: 'transparent' },
    put:     { bg: 'var(--color-warning-subtle)', fg: 'var(--color-warning-default)', bd: 'transparent' },
    del:     { bg: 'var(--color-danger-subtle)', fg: 'var(--color-danger-text)', bd: 'transparent' },
  }[variant] || { bg: 'var(--color-bg-overlay)', fg: 'var(--color-text-secondary)', bd: 'transparent' };
  const sized = size === 'sm'
    ? { h: 18, px: 6, fs: 10.5, fw: 600, ls: '0.06em', tt: 'uppercase' }
    : { h: 22, px: 8, fs: 12, fw: 500, ls: 'normal', tt: 'none' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      height: sized.h, padding: `0 ${sized.px}px`,
      borderRadius: 'var(--radius-sm)',
      background: map.bg, color: map.fg,
      border: `1px solid ${map.bd}`,
      fontSize: sized.fs, fontWeight: sized.fw, letterSpacing: sized.ls, textTransform: sized.tt,
      fontFamily: variant === 'code' || ['get','post','put','del'].includes(variant) ? 'var(--font-mono)' : 'inherit',
      lineHeight: 1,
      ...style,
    }}>
      {icon && <Icon name={icon} size={10} />}
      {children}
    </span>
  );
};

const Input = ({ label, value, onChange, placeholder, helper, error, size = 'md', leftIcon, rightIcon, readOnly, disabled, style = {}, type = 'text' }) => {
  useLucide([leftIcon, rightIcon]);
  const h = size === 'sm' ? 28 : 32;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{label}</label>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {leftIcon && <div style={{ position: 'absolute', left: 9, color: 'var(--color-text-tertiary)', display: 'flex' }}><Icon name={leftIcon} size={14} /></div>}
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly} disabled={disabled}
          style={{
            height: h,
            width: '100%',
            padding: `0 ${rightIcon || readOnly ? 30 : 10}px 0 ${leftIcon ? 30 : 10}px`,
            background: disabled ? 'var(--color-bg-subtle)' : 'var(--color-bg-elevated)',
            border: `1px solid ${error ? 'var(--color-danger-default)' : 'var(--color-border-default)'}`,
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-primary)',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color var(--duration-fast), box-shadow var(--duration-fast)',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--color-focus-ring)';
            e.target.style.boxShadow = '0 0 0 3px var(--color-accent-subtle)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = error ? 'var(--color-danger-default)' : 'var(--color-border-default)';
            e.target.style.boxShadow = 'none';
          }}
        />
        {rightIcon && !readOnly && <div style={{ position: 'absolute', right: 9, color: 'var(--color-text-tertiary)', display: 'flex' }}><Icon name={rightIcon} size={14} /></div>}
        {readOnly && <div style={{ position: 'absolute', right: 9, color: 'var(--color-text-tertiary)', display: 'flex' }}><Icon name="lock" size={12} /></div>}
      </div>
      {(helper || error) && <div style={{ fontSize: 12, color: error ? 'var(--color-danger-text)' : 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {error && <Icon name="alert-circle" size={12} />}
        {error || helper}
      </div>}
    </div>
  );
};

const Tooltip = ({ children, content, side = 'top', shortcut }) => (
  <span className="db-tooltip-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
    {children}
    <span className="db-tooltip" style={{
      position: 'absolute',
      [side]: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      [side === 'top' ? 'marginBottom' : 'marginTop']: 6,
      background: 'var(--gray-900)',
      color: 'var(--gray-50)',
      fontSize: 12,
      padding: '5px 8px',
      borderRadius: 'var(--radius-sm)',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      opacity: 0,
      transition: 'opacity var(--duration-fast)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {content}
      {shortcut && <kbd style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, padding: '1px 4px',
        background: 'rgba(255,255,255,0.1)', borderRadius: 3, color: 'var(--gray-400)',
      }}>{shortcut}</kbd>}
    </span>
  </span>
);

const TabsLine = ({ tabs, value, onChange }) => (
  <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border-default)' }}>
    {tabs.map(t => {
      const active = t.value === value;
      return (
        <button key={t.value} onClick={() => onChange(t.value)}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: `2px solid ${active ? 'var(--color-accent-default)' : 'transparent'}`,
            color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: active ? 600 : 500,
            fontFamily: 'inherit',
            cursor: 'pointer',
            marginBottom: -1,
            display: 'flex', alignItems: 'center', gap: 6,
            transition: 'color var(--duration-fast)',
          }}>
          {t.label}
          {t.badge}
        </button>
      );
    })}
  </div>
);

const TabsPill = ({ tabs, value, onChange }) => (
  <div style={{
    display: 'inline-flex', gap: 2, padding: 2,
    background: 'var(--color-bg-overlay)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-subtle)',
  }}>
    {tabs.map(t => {
      const active = t.value === value;
      return (
        <button key={t.value} onClick={() => onChange(t.value)}
          style={{
            background: active ? 'var(--color-bg-elevated)' : 'transparent',
            border: 'none',
            color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 500,
            fontFamily: 'inherit',
            borderRadius: 4,
            cursor: 'pointer',
            boxShadow: active ? 'var(--shadow-sm)' : 'none',
          }}>{t.label}</button>
      );
    })}
  </div>
);

const Divider = ({ vertical, style = {} }) => (
  vertical
    ? <div style={{ width: 1, height: 20, background: 'var(--color-border-subtle)', ...style }} />
    : <div style={{ height: 1, background: 'var(--color-border-subtle)', ...style }} />
);

const Kbd = ({ children }) => (
  <kbd style={{
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '1px 5px',
    background: 'var(--color-bg-overlay)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 3,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.4,
  }}>{children}</kbd>
);

Object.assign(window, { Icon, useLucide, Button, IconButton, Spinner, Badge, Input, Tooltip, TabsLine, TabsPill, Divider, Kbd });
