// db-foundations.jsx — design system reference cards (colors, type, spacing, radii, motion)

const SwatchRow = ({ name, value, light, dark, mono = true }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
    <div style={{ display: 'flex', gap: 4 }}>
      <div title={`light: ${light}`} style={{ width: 36, height: 24, borderRadius: 4, background: light, border: '1px solid var(--color-border-subtle)' }} />
      <div title={`dark: ${dark}`} style={{ width: 36, height: 24, borderRadius: 4, background: dark, border: '1px solid var(--color-border-subtle)' }} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: mono ? 'var(--font-mono)' : 'inherit', fontSize: 12, color: 'var(--color-text-primary)' }}>{name}</div>
      {value && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--color-text-tertiary)' }}>{value}</div>}
    </div>
  </div>
);

const FoundationsColors = () => (
  <div style={{ padding: 24, height: '100%', overflow: 'auto', background: 'var(--color-bg-elevated)' }}>
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Foundations</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', margin: '4px 0 0', letterSpacing: -0.3 }}>Semantic colors</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>Light · Dark · применяются через <code style={{ fontFamily: 'var(--font-mono)' }}>data-theme</code></p>
    </div>
    {[
      { name: '--color-bg-base', light: '#ffffff', dark: '#0a0a0b' },
      { name: '--color-bg-subtle', light: '#fafafa', dark: '#131316' },
      { name: '--color-bg-elevated', light: '#ffffff', dark: '#131316' },
      { name: '--color-bg-overlay', light: '#f4f4f5', dark: '#1c1c1f' },
      { name: '--color-border-default', light: '#e4e4e7', dark: '#27272a' },
      { name: '--color-border-subtle', light: '#ebebed', dark: '#1c1c1f' },
      { name: '--color-text-primary', light: '#0a0a0b', dark: '#fafafa' },
      { name: '--color-text-secondary', light: '#52525b', dark: '#a1a1aa' },
      { name: '--color-text-tertiary', light: '#71717a', dark: '#71717a' },
      { name: '--color-accent-default', light: '#2563eb', dark: '#3b82f6' },
      { name: '--color-accent-subtle', light: '#eff6ff', dark: 'rgba(59,130,246,0.12)' },
      { name: '--color-danger-default', light: '#dc2626', dark: '#ef4444' },
      { name: '--color-success-default', light: '#16a34a', dark: '#22c55e' },
      { name: '--color-warning-default', light: '#f59e0b', dark: '#f59e0b' },
    ].map(c => <SwatchRow key={c.name} {...c} />)}

    <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {[
        { l: 'Blue', tone: 'blue', h: '#2563eb' },
        { l: 'Lime', tone: 'lime', h: '#84cc16' },
        { l: 'Violet', tone: 'violet', h: '#7c3aed' },
        { l: 'Mono', tone: 'mono', h: '#0a0a0b' },
      ].map(a => (
        <div key={a.l} style={{ borderRadius: 6, border: '1px solid var(--color-border-subtle)', overflow: 'hidden' }}>
          <div style={{ height: 28, background: a.h }} />
          <div style={{ padding: 6, fontSize: 11, color: 'var(--color-text-primary)', fontWeight: 500 }}>{a.l}</div>
        </div>
      ))}
    </div>
  </div>
);

const FoundationsType = () => (
  <div style={{ padding: 24, height: '100%', overflow: 'auto', background: 'var(--color-bg-elevated)' }}>
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Foundations</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', margin: '4px 0 0', letterSpacing: -0.3 }}>Typography · Geist + Geist Mono</h2>
    </div>
    {[
      { l: 'display-lg · 32/40 · 600', s: { fontSize: 32, lineHeight: '40px', fontWeight: 600, letterSpacing: -0.6 }, t: 'Документация без боли' },
      { l: 'display-sm · 24/32 · 600', s: { fontSize: 24, lineHeight: '32px', fontWeight: 600, letterSpacing: -0.4 }, t: 'saveContractRestore' },
      { l: 'heading-lg · 18/28 · 600', s: { fontSize: 18, lineHeight: '28px', fontWeight: 600 }, t: 'Параметры запроса' },
      { l: 'heading-md · 16/24 · 600', s: { fontSize: 16, lineHeight: '24px', fontWeight: 600 }, t: 'Заголовок карточки' },
      { l: 'body-md · 14/20 · 400', s: { fontSize: 14, lineHeight: '20px', fontWeight: 400 }, t: 'Восстановление закрытого договора в АИС ГРКИ.' },
      { l: 'body-sm · 13/18 · 400', s: { fontSize: 13, lineHeight: '18px', fontWeight: 400, color: 'var(--color-text-secondary)' }, t: 'Метод вызывается при необходимости вернуть договор.' },
      { l: 'code · 13 · mono', s: { fontSize: 13, fontFamily: 'var(--font-mono)' }, t: 'POST /api/v1/grki-adapter/v1/saveContractRestore' },
      { l: 'label-sm · 11 · 500 · UPPER', s: { fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }, t: 'Параметры' },
    ].map(r => (
      <div key={r.l} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{r.l}</div>
        <div style={{ color: 'var(--color-text-primary)', ...r.s }}>{r.t}</div>
      </div>
    ))}
  </div>
);

const FoundationsSpacing = () => (
  <div style={{ padding: 24, height: '100%', overflow: 'auto', background: 'var(--color-bg-elevated)' }}>
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Foundations</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', margin: '4px 0 0', letterSpacing: -0.3 }}>Spacing · Radii · Shadow</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>4px-base scale</p>
    </div>

    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Spacing</div>
      {[2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64].map(v => (
        <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
          <div style={{ width: 60, fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>space-{v / 4 < 1 ? '0_5' : v / 4}</div>
          <div style={{ height: 8, background: 'var(--color-accent-default)', borderRadius: 2, width: v }} />
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{v}px</div>
        </div>
      ))}
    </div>

    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Radii</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        {[{ n: 'sm', v: 4 }, { n: 'md', v: 6 }, { n: 'lg', v: 8 }, { n: 'xl', v: 12 }, { n: 'full', v: 28 }].map(r => (
          <div key={r.n} style={{ textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: 'var(--color-bg-overlay)', border: '1px solid var(--color-border-default)', borderRadius: r.n === 'full' ? '50%' : r.v }} />
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>radius-{r.n}</div>
          </div>
        ))}
      </div>
    </div>

    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Shadow</div>
      <div style={{ display: 'flex', gap: 16 }}>
        {['sm', 'md', 'lg'].map(s => (
          <div key={s} style={{ textAlign: 'center' }}>
            <div style={{ width: 80, height: 56, background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-subtle)', borderRadius: 6, boxShadow: `var(--shadow-${s})` }} />
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>shadow-{s}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const FoundationsMotion = () => (
  <div style={{ padding: 24, height: '100%', overflow: 'auto', background: 'var(--color-bg-elevated)' }}>
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Foundations</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', margin: '4px 0 0', letterSpacing: -0.3 }}>Motion · Iconography</h2>
    </div>

    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Duration</div>
      {[
        { n: 'fast', v: '100ms', use: 'hover, immediate feedback' },
        { n: 'normal', v: '150ms', use: 'most transitions' },
        { n: 'enter', v: '200ms', use: 'element appears' },
        { n: 'exit', v: '150ms', use: 'element disappears' },
        { n: 'slow', v: '250ms', use: 'sidebar, panel' },
      ].map(d => (
        <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ width: 80, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>duration-{d.n}</div>
          <div style={{ width: 60, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-accent-text)' }}>{d.v}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{d.use}</div>
        </div>
      ))}
    </div>

    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Lucide icons · 16/20/24</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {['file-code-2','book-open','sparkles','search','settings','plus','trash-2','copy','download','upload','undo-2','redo-2','sun','moon','folder','chevron-down','check','alert-circle','wand-sparkles','braces'].map(i => (
          <div key={i} style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--color-border-subtle)', borderRadius: 6,
            background: 'var(--color-bg-base)',
            color: 'var(--color-text-secondary)',
          }}>
            <Icon name={i} size={16} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

Object.assign(window, { FoundationsColors, FoundationsType, FoundationsSpacing, FoundationsMotion });
