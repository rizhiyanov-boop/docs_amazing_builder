// db-content.jsx — content area: editor, html preview, wiki preview, AI bar, dialogs, toasts

const ContentArea = ({ tab = 'wiki', onTab, children }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base)', minWidth: 0 }}>
    <div style={{ padding: '10px 20px 0', borderBottom: '1px solid var(--color-border-default)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <TabsLine
        value={tab}
        onChange={onTab || (() => {})}
        tabs={[
          { value: 'editor', label: 'Редактор' },
          { value: 'html', label: 'HTML' },
          { value: 'wiki', label: 'Wiki' },
        ]}
      />
      <div style={{ paddingBottom: 8, display: 'flex', gap: 6 }}>
        <Tooltip content="Показать сетку"><IconButton icon="layout-grid" size="sm" /></Tooltip>
        <Tooltip content="На весь экран"><IconButton icon="maximize-2" size="sm" /></Tooltip>
      </div>
    </div>
    <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>{children}</div>
  </div>
);

// ============== EDITOR TAB ==============
const EditorView = ({ showAi = true }) => (
  <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Badge variant="post" size="sm">POST</Badge>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-secondary)' }}>/api/v1/grki-adapter/v1/saveContractRestore</span>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, letterSpacing: -0.4 }}>saveContractRestore</h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '6px 0 0' }}>Восстановление закрытого договора в АИС ГРКИ.</p>
    </div>

    {showAi && <AiActionBar />}

    <SectionCard title="Цель" eyebrow="Цель метода">
      <textarea defaultValue="Восстановление закрытого договора в АИС ГРКИ. Метод вызывается при необходимости вернуть в активное состояние договор, ранее переведённый в статус «списан» или «закрыт»." style={{
        width: '100%', minHeight: 80,
        padding: 12,
        background: 'var(--color-bg-base)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--color-text-primary)',
        fontSize: 14, lineHeight: 1.5,
        fontFamily: 'inherit',
        resize: 'vertical',
        outline: 'none',
      }} />
    </SectionCard>

    <SectionCard title="Функциональные требования" eyebrow="Список требований" actions={<Button variant="ghost" size="sm" icon="sparkles">Дополнить</Button>}>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
        <li>Изменить статус договора с «закрыт» на «текущий».</li>
        <li>Зафиксировать факт восстановления в истории договора.</li>
        <li>Вернуть актуальную сумму задолженности на дату восстановления.</li>
      </ul>
    </SectionCard>

    <SectionCard title="Request" eyebrow="Параметры запроса" badge={<Badge variant="post" size="sm">REQUEST</Badge>}
      actions={<>
        <Button variant="ghost" size="sm" icon="sparkles">Заполнить описания</Button>
        <Button variant="ghost" size="sm" icon="upload">Импорт JSON</Button>
        <Button variant="secondary" size="sm" icon="plus">Добавить поле</Button>
      </>}>
      <ParamTable rows={[
        { name: 'contractId', type: 'string', req: true, desc: 'Идентификатор договора в АИС ГРКИ' },
        { name: 'restoreDate', type: 'date', req: true, desc: 'Дата восстановления договора' },
        { name: 'restoreReason', type: 'enum', req: true, desc: 'Причина восстановления (court/bank/client)' },
        { name: 'comment', type: 'string', req: false, desc: 'Произвольный комментарий оператора' },
        { name: 'operator', type: 'object', req: false, desc: 'Сведения об операторе, инициировавшем восстановление' },
      ]} />
    </SectionCard>

    <SectionCard title="Response" eyebrow="Структура ответа" badge={<Badge variant="get" size="sm">RESPONSE</Badge>}
      actions={<Button variant="ghost" size="sm" icon="sparkles">Сгенерировать примеры</Button>}>
      <ParamTable rows={[
        { name: 'success', type: 'boolean', req: true, desc: 'Признак успешности операции' },
        { name: 'contract', type: 'object', req: true, desc: 'Восстановленный договор' },
        { name: 'history', type: 'array', req: false, desc: 'История изменений статуса договора' },
      ]} />
    </SectionCard>
  </div>
);

const SectionCard = ({ title, eyebrow, badge, actions, children }) => (
  <div style={{
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px',
      borderBottom: '1px solid var(--color-border-subtle)',
      background: 'var(--color-bg-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {badge}
        <div>
          {eyebrow && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{eyebrow}</div>}
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: eyebrow ? 2 : 0 }}>{title}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>{actions}</div>
    </div>
    <div style={{ padding: 16 }}>{children}</div>
  </div>
);

const ParamTable = ({ rows }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
    <thead>
      <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        {['Поле', 'Тип', 'Обяз.', 'Описание', ''].map(h => (
          <th key={h} style={{
            textAlign: 'left', padding: '6px 10px',
            fontSize: 10, fontWeight: 600,
            color: 'var(--color-text-tertiary)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>{h}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={r.name} style={{
          borderBottom: i < rows.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
        }}>
          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.name}</td>
          <td style={{ padding: '8px 10px' }}><Badge variant="code" size="sm">{r.type}</Badge></td>
          <td style={{ padding: '8px 10px' }}>{r.req ? <Badge variant="danger" size="sm">required</Badge> : <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>—</span>}</td>
          <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)' }}>{r.desc}</td>
          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
            <IconButton icon="more-horizontal" size="sm" />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const AiActionBar = ({ loading } = {}) => (
  <div style={{
    background: 'var(--color-accent-subtle)',
    border: '1px solid var(--color-accent-border)',
    borderRadius: 'var(--radius-lg)',
    padding: '10px 14px',
    display: 'flex', alignItems: 'center', gap: 12,
  }}>
    <div style={{
      width: 28, height: 28, borderRadius: 'var(--radius-md)',
      background: 'var(--color-accent-default)',
      color: 'var(--color-text-on-accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon name="sparkles" size={14} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {loading ? 'Составляю описания полей…' : 'AI-помощник'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 1 }}>
        {loading ? 'Анализирую структуру запроса и подбираю формулировки.' : 'Сгенерировать описания, примеры значений или маппинг полей.'}
      </div>
    </div>
    {loading
      ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-accent-text)', fontSize: 12 }}>
          <Spinner size={12} /> Генерация…
          <Button variant="ghost" size="sm">Отмена</Button>
        </div>
      : <div style={{ display: 'flex', gap: 4 }}>
          <Button variant="ghost" size="sm" icon="wand-sparkles">Заполнить описания</Button>
          <Button variant="ghost" size="sm" icon="lightbulb">Предложить маппинг</Button>
          <Button variant="ghost" size="sm" icon="braces">Сгенерировать пример</Button>
        </div>}
  </div>
);

// ============== HTML PREVIEW TAB ==============
const HtmlPreview = () => (
  <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>Предпросмотр HTML</h2>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button variant="secondary" size="sm" icon="copy">Скопировать</Button>
        <Button variant="secondary" size="sm" icon="download">Скачать</Button>
      </div>
    </div>
    <div style={{
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border-default)',
      borderRadius: 'var(--radius-lg)',
      padding: 0,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      color: 'var(--color-text-primary)',
      lineHeight: 1.55,
    }}>
      <pre style={{ margin: 0, padding: 16, overflow: 'auto', background: 'transparent' }}>{`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>saveContractRestore</title>
</head>
<body>
  <h1>saveContractRestore</h1>
  <p><strong>Метод:</strong> POST /api/v1/grki-adapter/v1/saveContractRestore</p>
  <p>Восстановление закрытого договора в АИС ГРКИ.</p>

  <h2>Параметры запроса</h2>
  <table>
    <tr><th>Поле</th><th>Тип</th><th>Обязательно</th><th>Описание</th></tr>
    <tr><td>contractId</td><td>string</td><td>да</td><td>Идентификатор договора</td></tr>
    <tr><td>restoreDate</td><td>date</td><td>да</td><td>Дата восстановления</td></tr>
    <tr><td>restoreReason</td><td>enum</td><td>да</td><td>Причина восстановления</td></tr>
  </table>
</body>
</html>`}</pre>
    </div>
  </div>
);

// ============== WIKI PREVIEW TAB ==============
const WikiPreview = () => (
  <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>Предпросмотр Wiki</h2>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button variant="secondary" size="sm" icon="copy">Скопировать</Button>
        <Button variant="secondary" size="sm" icon="download">Скачать</Button>
      </div>
    </div>
    <div style={{
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border-default)',
      borderRadius: 'var(--radius-lg)',
      padding: 0,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      color: 'var(--color-text-primary)',
      lineHeight: 1.6,
    }}>
      <pre style={{ margin: 0, padding: 16, overflow: 'auto', background: 'transparent' }}>{`{toc}

h2. История изменений

||Версия||Описание||Исполнитель||Дата||Jira||
|v.1|Создание документа|&#160;|&#160;|&#160;|

h2. Постановка задачи

|Epic:|&#160;|
|Цель:|&#160;|
|Инициаторы:|&#160;|
|Ответственный разработчик / модуль:|&#160;|

h2. Общая информация

|Метод|POST /api/v1/grki-adapter/v1/saveContractRestore|
|Внешний URL|&#160;|

h3. Цель

Восстановление закрытого договора в АИС ГРКИ.

h2. Функциональные требования`}</pre>
    </div>
  </div>
);

// ============== EMPTY STATE ==============
const EmptyState = ({ kind = 'no-method' }) => {
  const map = {
    'no-method': {
      icon: 'file-plus-2',
      title: 'Выберите метод',
      desc: 'Откройте метод из списка слева, чтобы начать редактирование, или создайте новый.',
      cta: 'Создать метод',
      ctaIcon: 'plus',
    },
    'no-section': {
      icon: 'layout-template',
      title: 'Секции пока нет',
      desc: 'Добавьте первую секцию: цель, требования, запрос или ответ.',
      cta: 'Добавить секцию',
      ctaIcon: 'plus',
    },
    'empty-project': {
      icon: 'folder-open',
      title: 'Это пустой проект',
      desc: 'Импортируйте OpenAPI-спецификацию или создайте первый метод вручную.',
      cta: 'Импорт OpenAPI',
      ctaIcon: 'upload',
    },
  }[kind];
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40,
      flexDirection: 'column', gap: 16, textAlign: 'center', minHeight: 320,
    }}>
      <div style={{
        width: 56, height: 56,
        background: 'var(--color-bg-overlay)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-xl)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text-tertiary)',
      }}>
        <Icon name={map.icon} size={24} />
      </div>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, letterSpacing: -0.3 }}>{map.title}</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: '6px 0 0', maxWidth: 320 }}>{map.desc}</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" size="md" icon={map.ctaIcon}>{map.cta}</Button>
        {kind === 'empty-project' && <Button variant="secondary" size="md">Шаблон</Button>}
      </div>
    </div>
  );
};

// ============== CONFIRMATION DIALOG ==============
const ConfirmDialog = () => (
  <div style={{
    position: 'absolute', inset: 0,
    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 50,
  }}>
    <div style={{
      width: 400,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border-default)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '20px 20px 0', display: 'flex', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 'var(--radius-md)',
          background: 'var(--color-danger-subtle)',
          color: 'var(--color-danger-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name="trash-2" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>Удалить метод saveContractRestore?</h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }}>
            Метод и все его секции будут безвозвратно удалены. История изменений сохранится в журнале проекта 30 дней.
          </p>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, background: 'var(--color-bg-subtle)', marginTop: 20, borderTop: '1px solid var(--color-border-subtle)' }}>
        <Button variant="secondary" size="md">Отмена</Button>
        <Button variant="danger" size="md">Удалить</Button>
      </div>
    </div>
  </div>
);

// ============== REPLACE DROPDOWN ==============
const ReplaceDropdown = () => (
  <div style={{
    position: 'absolute', top: 60, left: 200, width: 280,
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    padding: 4,
    zIndex: 30,
  }}>
    <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Действия с методом</div>
    {[
      { icon: 'pencil', label: 'Переименовать', shortcut: 'F2' },
      { icon: 'copy', label: 'Дублировать', shortcut: '⌘D' },
      { icon: 'arrow-up-down', label: 'Переместить' },
      { icon: 'sparkles', label: 'Заменить через AI' },
    ].map(item => (
      <div key={item.label} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        color: 'var(--color-text-primary)',
        fontSize: 13,
      }}>
        <Icon name={item.icon} size={14} color="var(--color-text-tertiary)" />
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
      </div>
    ))}
    <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '4px 0' }} />
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-danger-text)', fontSize: 13 }}>
      <Icon name="trash-2" size={14} />
      <span style={{ flex: 1 }}>Удалить метод</span>
      <Kbd>⌫</Kbd>
    </div>
  </div>
);

// ============== TOAST ==============
const Toast = ({ variant = 'success', title, desc, action }) => {
  const map = {
    success: { icon: 'check-circle-2', color: 'var(--color-success-text)', bg: 'var(--color-success-subtle)' },
    info:    { icon: 'info', color: 'var(--color-accent-text)', bg: 'var(--color-accent-subtle)' },
    error:   { icon: 'alert-circle', color: 'var(--color-danger-text)', bg: 'var(--color-danger-subtle)' },
  }[variant];
  return (
    <div style={{
      width: 320,
      background: 'var(--color-bg-elevated)',
      border: '1px solid var(--color-border-default)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-lg)',
      padding: 12,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 'var(--radius-md)',
        background: map.bg, color: map.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name={map.icon} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{desc}</div>}
        {action && <div style={{ marginTop: 6 }}><Button variant="link" size="sm">{action}</Button></div>}
      </div>
      <IconButton icon="x" size="sm" />
    </div>
  );
};

Object.assign(window, { ContentArea, EditorView, SectionCard, ParamTable, AiActionBar, HtmlPreview, WikiPreview, EmptyState, ConfirmDialog, ReplaceDropdown, Toast });
