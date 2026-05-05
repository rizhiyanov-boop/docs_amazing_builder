// db-app.jsx — full app screens (editor, html preview, wiki preview, empty state)

const ApiLogo = ({ size = 28 }) => (
  <div style={{
    width: size, height: size,
    background: 'var(--color-accent-default)',
    color: 'var(--color-text-on-accent)',
    borderRadius: 'var(--radius-md)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: size * 0.36, letterSpacing: -0.5,
    fontFamily: 'var(--font-mono)',
  }}>API</div>
);

// ============== TOPBAR ==============
const Topbar = ({ activeView = 'wiki', onView, layout = 'grouped', autosave = 'saved', onTheme, theme }) => {
  return (
    <div style={{
      height: 48,
      borderBottom: '1px solid var(--color-border-default)',
      background: 'var(--color-bg-elevated)',
      display: 'flex', alignItems: 'center',
      padding: '0 12px',
      gap: 8,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8 }}>
        <ApiLogo size={26} />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: -0.2 }}>doc-builder</div>
      </div>

      <Divider vertical />

      {layout === 'grouped' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', marginRight: 6 }}>МЕТОД</span>
            <Tooltip content="Экспорт JSON" shortcut="⌘1"><IconButton icon="braces" size="sm" /></Tooltip>
            <Tooltip content="Экспорт MOCK"><IconButton icon="flask-conical" size="sm" /></Tooltip>
            <Tooltip content="Экспорт HTML"><IconButton icon="file-code-2" size="sm" /></Tooltip>
            <Tooltip content="Экспорт WIKI"><IconButton icon="book-open" size="sm" /></Tooltip>
          </div>
          <Divider vertical />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', marginRight: 6 }}>ПРОЕКТ</span>
            <Button variant="ghost" size="sm" icon="file-code-2">HTML</Button>
            <Button variant="ghost" size="sm" icon="book-open">Wiki</Button>
          </div>
        </>
      ) : layout === 'flat' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {['JSON','MOCK','HTML','WIKI'].map(l => (
            <Button key={l} variant="ghost" size="sm">{l}</Button>
          ))}
          <Divider vertical />
          <Button variant="ghost" size="sm" icon="folder-output">Проект HTML</Button>
          <Button variant="ghost" size="sm" icon="folder-output">Проект Wiki</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button variant="secondary" size="sm" icon="download" iconRight="chevron-down">Экспорт метода</Button>
          <Button variant="secondary" size="sm" icon="folder-output" iconRight="chevron-down">Экспорт проекта</Button>
        </div>
      )}

      <Divider vertical />

      <div style={{ display: 'flex', gap: 2 }}>
        <Tooltip content="Отменить" shortcut="⌘Z"><IconButton icon="undo-2" size="sm" /></Tooltip>
        <Tooltip content="Повторить" shortcut="⌘⇧Z"><IconButton icon="redo-2" size="sm" /></Tooltip>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <AutosaveIndicator state={autosave} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Tooltip content="Команда">
          <button style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: '1px solid transparent',
            padding: '4px 8px', borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            color: 'var(--color-text-primary)',
            fontFamily: 'inherit', fontSize: 13,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-accent-default), var(--violet-500))',
              color: '#fff', fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>F</div>
            <span style={{ fontSize: 13 }}>froldoc</span>
            <Icon name="chevron-down" size={12} color="var(--color-text-tertiary)" />
          </button>
        </Tooltip>
        <Divider vertical />
        <Tooltip content="Поиск" shortcut="⌘K"><IconButton icon="search" size="sm" /></Tooltip>
        <Tooltip content="Помощь" shortcut="?"><IconButton icon="circle-help" size="sm" /></Tooltip>
        <Tooltip content={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
          <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} size="sm" onClick={onTheme} />
        </Tooltip>
      </div>
    </div>
  );
};

const AutosaveIndicator = ({ state = 'saved' }) => {
  const map = {
    saved: { icon: 'check', text: 'Сохранено · 2 мин назад', color: 'var(--color-text-tertiary)' },
    saving: { icon: 'loader', text: 'Сохранение…', color: 'var(--color-text-tertiary)' },
    error: { icon: 'alert-circle', text: 'Ошибка сохранения', color: 'var(--color-danger-text)' },
  }[state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: map.color }}>
      <Icon name={map.icon} size={12} />
      {map.text}
      {state === 'error' && <Button variant="link" size="sm">Повторить</Button>}
    </div>
  );
};

// ============== SIDEBAR ==============
const methodsData = [
  { name: 'saveClaim', verb: 'POST', sections: ['Цель', 'Функциональные требования', 'Request', 'Response', 'Нефункциональные требования'] },
  { name: 'saveContract', verb: 'POST' },
  { name: 'saveProvision', verb: 'POST' },
  { name: 'saveClaimReject', verb: 'POST' },
  { name: 'saveSchedule', verb: 'PUT' },
  { name: 'setStateToClose', verb: 'PATCH' },
  { name: 'saveCoborrower', verb: 'POST' },
  { name: 'changeStateFromContractWriteOffToCurrent', verb: 'PATCH' },
  { name: 'changeStateFromContractWriteOffToReview', verb: 'PATCH' },
  { name: 'saveCoborrower2', verb: 'POST' },
  { name: 'saveBorrower', verb: 'POST' },
  { name: 'saveBorrower2', verb: 'POST' },
  { name: 'saveAgreement', verb: 'POST' },
  { name: 'setStateToCurrent', verb: 'PATCH' },
  { name: 'setStateToLitigation', verb: 'PATCH' },
  { name: 'saveCourtDecision', verb: 'POST' },
  { name: 'saveContractMove', verb: 'POST' },
  { name: 'saveContractWriteOff', verb: 'POST' },
  { name: 'getInformation', verb: 'GET' },
  { name: 'saveContractNotary', verb: 'POST' },
  { name: 'saveContractRestore', verb: 'POST', expanded: true },
];

const Sidebar = ({ style = 'tree', activeMethod = 'saveContractRestore', activeSection = 'Цель' }) => {
  if (style === 'flat') return <SidebarFlat activeMethod={activeMethod} />;
  if (style === 'grouped') return <SidebarGrouped activeMethod={activeMethod} />;
  return <SidebarTree activeMethod={activeMethod} activeSection={activeSection} />;
};

const SidebarHeader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <Icon name="folder" size={14} color="var(--color-text-tertiary)" />
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>ГРКИ new</div>
      <Badge variant="neutral" size="sm">21</Badge>
    </div>
    <div style={{ display: 'flex', gap: 2 }}>
      <Tooltip content="Свернуть всё"><IconButton icon="list-collapse" size="sm" /></Tooltip>
      <Tooltip content="Поиск" shortcut="⌘P"><IconButton icon="search" size="sm" /></Tooltip>
    </div>
  </div>
);

const SidebarFooter = () => (
  <div>
    <div style={{
      padding: '8px 12px', borderTop: '1px solid var(--color-border-subtle)',
      fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)',
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>Рабочее пространство</div>
    {[
      { name: 'ГРКИ new', count: 21, active: true },
      { name: 'OpenAPI', count: 12 },
      { name: 'Internal', count: 8 },
    ].map(p => (
      <div key={p.name} style={{
        padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: p.active ? 'var(--color-bg-hover)' : 'transparent',
        cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="folder" size={12} color="var(--color-text-tertiary)" />
          <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{p.name}</span>
        </div>
        <Badge variant="neutral" size="sm">{p.count}</Badge>
      </div>
    ))}
    <div style={{ padding: '8px 12px', display: 'flex', gap: 4, borderTop: '1px solid var(--color-border-subtle)' }}>
      <Tooltip content="Добавить метод"><IconButton icon="plus" size="sm" /></Tooltip>
      <Tooltip content="Удалить"><IconButton icon="minus" size="sm" /></Tooltip>
    </div>
  </div>
);

const verbColor = (v) => {
  const c = {
    GET: 'var(--color-success-text)',
    POST: 'var(--color-accent-text)',
    PUT: 'var(--color-warning-default)',
    PATCH: 'var(--violet-500)',
    DELETE: 'var(--color-danger-text)',
  }[v];
  return c || 'var(--color-text-tertiary)';
};

const SidebarTree = ({ activeMethod, activeSection }) => (
  <div style={{
    width: 260, height: '100%',
    background: 'var(--color-bg-subtle)',
    borderRight: '1px solid var(--color-border-default)',
    display: 'flex', flexDirection: 'column',
  }}>
    <SidebarHeader />
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
      {methodsData.map(m => {
        const active = m.name === activeMethod;
        const expanded = m.expanded || active;
        return (
          <div key={m.name}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 30, padding: '0 12px',
              background: active && !expanded ? 'var(--color-accent-subtle)' : 'transparent',
              borderLeft: active ? '2px solid var(--color-accent-default)' : '2px solid transparent',
              paddingLeft: 10,
              cursor: 'pointer',
            }}>
              <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={12} color="var(--color-text-tertiary)" />
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 600,
                color: verbColor(m.verb), width: 38, flexShrink: 0,
              }}>{m.verb}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12.5,
                color: 'var(--color-text-primary)',
                fontWeight: active ? 600 : 400,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{m.name}</span>
            </div>
            {expanded && m.sections && m.sections.map(s => {
              const sActive = active && s === activeSection;
              return (
                <div key={s} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  height: 26, padding: '0 12px 0 38px',
                  background: sActive ? 'var(--color-accent-subtle)' : 'transparent',
                  borderLeft: sActive ? '2px solid var(--color-accent-default)' : '2px solid transparent',
                  paddingLeft: sActive ? 36 : 38,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  color: sActive ? 'var(--color-accent-text)' : 'var(--color-text-secondary)',
                  fontWeight: sActive ? 500 : 400,
                }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                  {(s === 'Request' || s === 'Response') && <Badge variant="code" size="sm">{s.toUpperCase()}</Badge>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
    <SidebarFooter />
  </div>
);

const SidebarFlat = ({ activeMethod }) => (
  <div style={{
    width: 260, height: '100%',
    background: 'var(--color-bg-subtle)',
    borderRight: '1px solid var(--color-border-default)',
    display: 'flex', flexDirection: 'column',
  }}>
    <SidebarHeader />
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
      {methodsData.map(m => {
        const active = m.name === activeMethod;
        return (
          <div key={m.name} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            height: 32, padding: '0 12px',
            background: active ? 'var(--color-accent-subtle)' : 'transparent',
            borderLeft: active ? '2px solid var(--color-accent-default)' : '2px solid transparent',
            paddingLeft: active ? 10 : 12,
            cursor: 'pointer',
          }}>
            <Badge variant={m.verb === 'GET' ? 'get' : m.verb === 'POST' ? 'post' : m.verb === 'PUT' ? 'put' : 'accent'} size="sm">{m.verb}</Badge>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 12.5,
              color: 'var(--color-text-primary)',
              fontWeight: active ? 600 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{m.name}</span>
          </div>
        );
      })}
    </div>
    <SidebarFooter />
  </div>
);

const SidebarGrouped = ({ activeMethod }) => {
  const groups = {
    Claim: methodsData.filter(m => m.name.toLowerCase().includes('claim')),
    Contract: methodsData.filter(m => m.name.toLowerCase().includes('contract')),
    Borrower: methodsData.filter(m => m.name.toLowerCase().includes('borrower')),
    State: methodsData.filter(m => m.name.toLowerCase().includes('state')),
    Other: methodsData.filter(m => !['claim','contract','borrower','state'].some(k => m.name.toLowerCase().includes(k))),
  };
  return (
    <div style={{
      width: 260, height: '100%',
      background: 'var(--color-bg-subtle)',
      borderRight: '1px solid var(--color-border-default)',
      display: 'flex', flexDirection: 'column',
    }}>
      <SidebarHeader />
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {Object.entries(groups).map(([g, items]) => (
          <div key={g}>
            <div style={{
              padding: '8px 12px 4px',
              fontSize: 10, fontWeight: 600,
              color: 'var(--color-text-tertiary)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{g}</span>
              <span>{items.length}</span>
            </div>
            {items.map(m => {
              const active = m.name === activeMethod;
              return (
                <div key={m.name} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  height: 28, padding: '0 12px',
                  background: active ? 'var(--color-accent-subtle)' : 'transparent',
                  borderLeft: active ? '2px solid var(--color-accent-default)' : '2px solid transparent',
                  paddingLeft: active ? 10 : 12,
                  cursor: 'pointer',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600,
                    color: verbColor(m.verb), width: 34, flexShrink: 0,
                  }}>{m.verb}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--color-text-primary)',
                    fontWeight: active ? 600 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{m.name}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <SidebarFooter />
    </div>
  );
};

Object.assign(window, { ApiLogo, Topbar, Sidebar, SidebarTree, SidebarFlat, SidebarGrouped, AutosaveIndicator, methodsData, verbColor });
