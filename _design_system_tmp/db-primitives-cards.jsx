// db-primitives-cards.jsx — primitive specimen cards for the canvas

const PrimCard = ({ title, eyebrow, children }) => (
  <div style={{ padding: 24, height: '100%', overflow: 'auto', background: 'var(--color-bg-elevated)' }}>
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{eyebrow}</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', margin: '4px 0 0', letterSpacing: -0.3 }}>{title}</h2>
    </div>
    {children}
  </div>
);

const Sub = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.04em', textTransform: 'uppercase', margin: '16px 0 8px' }}>{children}</div>
);

const ButtonsCard = () => (
  <PrimCard eyebrow="Primitive" title="Button">
    <Sub>Variants · md</Sub>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="primary" icon="sparkles">Primary</Button>
      <Button variant="secondary" icon="download">Secondary</Button>
      <Button variant="ghost" icon="copy">Ghost</Button>
      <Button variant="danger" icon="trash-2">Danger</Button>
    </div>
    <Sub>Sizes</Sub>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Button variant="secondary" size="sm">Small</Button>
      <Button variant="secondary" size="md">Medium</Button>
      <Button variant="secondary" size="lg">Large</Button>
    </div>
    <Sub>States</Sub>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button variant="primary">Default</Button>
      <Button variant="primary" loading>Loading</Button>
      <Button variant="primary" disabled>Disabled</Button>
      <Button variant="link">Текстовая ссылка</Button>
    </div>
    <Sub>Icon-only</Sub>
    <div style={{ display: 'flex', gap: 4 }}>
      {['search','settings','copy','download','trash-2'].map(i => <IconButton key={i} icon={i} />)}
    </div>
  </PrimCard>
);

const InputsCard = () => (
  <PrimCard eyebrow="Primitive" title="Input · Textarea">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Input label="Имя метода" value="saveContractRestore" leftIcon="braces" onChange={() => {}} />
      <Input label="Внешний URL" placeholder="например: https://api.grki.ru/v1/..." onChange={() => {}} helper="URL внешней системы, в которую проксируется метод" />
      <Input label="Внутренний путь" value="/api/v1/grki-adapter/v1/saveContractRestore" readOnly onChange={() => {}} />
      <Input label="Email владельца" value="not-an-email" onChange={() => {}} error="Введите корректный email" />
    </div>
  </PrimCard>
);

const BadgesCard = () => (
  <PrimCard eyebrow="Primitive" title="Badge · Tag">
    <Sub>HTTP methods</Sub>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Badge variant="get">GET</Badge>
      <Badge variant="post">POST</Badge>
      <Badge variant="put">PUT</Badge>
      <Badge variant="del">DELETE</Badge>
      <Badge variant="accent">PATCH</Badge>
    </div>
    <Sub>Semantic</Sub>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Badge variant="neutral">neutral</Badge>
      <Badge variant="accent">accent</Badge>
      <Badge variant="success">success</Badge>
      <Badge variant="warning">warning</Badge>
      <Badge variant="danger">danger</Badge>
    </div>
    <Sub>Section labels</Sub>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Badge variant="post">REQUEST</Badge>
      <Badge variant="get">RESPONSE</Badge>
      <Badge variant="code">string</Badge>
      <Badge variant="code">object</Badge>
      <Badge variant="danger">required</Badge>
    </div>
    <Sub>Medium size · readable</Sub>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Badge variant="success" size="md" icon="check">Сохранено</Badge>
      <Badge variant="warning" size="md" icon="clock">В процессе</Badge>
      <Badge variant="accent" size="md" icon="sparkles">AI</Badge>
    </div>
  </PrimCard>
);

const TabsAndDropdownCard = () => (
  <PrimCard eyebrow="Primitive" title="Tabs · Dropdown · Tooltip · Kbd">
    <Sub>Line tabs</Sub>
    <TabsLine value="wiki" onChange={() => {}}
      tabs={[{ value: 'editor', label: 'Редактор' }, { value: 'html', label: 'HTML' }, { value: 'wiki', label: 'Wiki' }]} />
    <Sub>Pill tabs</Sub>
    <TabsPill value="all" onChange={() => {}}
      tabs={[{ value: 'all', label: 'Все' }, { value: 'req', label: 'Request' }, { value: 'res', label: 'Response' }]} />
    <Sub>Dropdown menu</Sub>
    <div style={{ position: 'relative', height: 220 }}>
      <ReplaceDropdown />
    </div>
    <Sub>Keyboard shortcuts</Sub>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
      <Kbd>⌘K</Kbd> поиск · <Kbd>⌘S</Kbd> сохранить · <Kbd>?</Kbd> хоткеи
    </div>
  </PrimCard>
);

const TableCard = () => (
  <PrimCard eyebrow="Primitive" title="Table · inline editing">
    <ParamTable rows={[
      { name: 'contractId', type: 'string', req: true, desc: 'Идентификатор договора' },
      { name: 'restoreDate', type: 'date', req: true, desc: 'Дата восстановления' },
      { name: 'comment', type: 'string', req: false, desc: 'Произвольный комментарий' },
    ]} />
    <Sub>Selected row</Sub>
    <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 2fr', padding: '8px 12px', background: 'var(--color-accent-subtle)', borderLeft: '2px solid var(--color-accent-default)', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 500 }}>restoreReason</span>
        <Badge variant="code" size="sm">enum</Badge>
        <Badge variant="danger" size="sm">required</Badge>
        <Input value="Причина восстановления" size="sm" onChange={() => {}} />
      </div>
    </div>
  </PrimCard>
);

const ToastsCard = () => (
  <PrimCard eyebrow="Primitive" title="Toast notifications">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Toast variant="success" title="Скопировано в буфер" desc="HTML-документ saveContractRestore.html готов к вставке." />
      <Toast variant="info" title="Экспорт начат" desc="Сборка проекта в Wiki-формат — 23 метода." action="Открыть журнал" />
      <Toast variant="error" title="Ошибка сохранения" desc="Не удалось синхронизировать поля Request с сервером." action="Повторить" />
    </div>
  </PrimCard>
);

Object.assign(window, { PrimCard, Sub, ButtonsCard, InputsCard, BadgesCard, TabsAndDropdownCard, TableCard, ToastsCard });
