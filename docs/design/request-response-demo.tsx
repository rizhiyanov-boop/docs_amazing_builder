import { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/tokens.css';
import '../../src/tokens-workbench.css';
import '../../src/App.css';
import '../../src/components/workbench/workbench-shell.css';
import '../../src/components/workbench/editor-standard.css';
import { WBButton, HttpChip } from '../../src/components/primitives/WorkbenchPrimitives';
import { WorkbenchIcon } from '../../src/components/workbench/WorkbenchIcon';

type ParameterRow = {
  id: string;
  field: string;
  type: string;
  required: boolean;
  validations: string;
  clientField?: string;
  description: string;
  maskInLogs: boolean;
  example: string;
};

// Initial Data for Demo
const INITIAL_SERVER_REQUEST_ROWS: ParameterRow[] = [
  { id: 'sr1', field: 'senderCardNumber', type: 'string', required: true, validations: 'regex(^\\d{16}$)', clientField: 'sourceCard', description: 'Номер карты списания (16 цифр)', maskInLogs: true, example: '8600123456789012' },
  { id: 'sr2', field: 'recipientCardNumber', type: 'string', required: true, validations: 'regex(^\\d{16}$)', clientField: 'targetCard', description: 'Номер карты зачисления получателя', maskInLogs: true, example: '8600987654321098' },
  { id: 'sr3', field: 'amount', type: 'number', required: true, validations: 'min: 1000, max: 50000000', clientField: 'transferAmount', description: 'Сумма перевода в тийинах / базовой валюте', maskInLogs: false, example: '25000000' },
  { id: 'sr4', field: 'currency', type: 'string', required: true, validations: 'in: UZS, USD, EUR', clientField: 'currencyCode', description: 'Буквенный код валюты операции по ISO-4217', maskInLogs: false, example: 'UZS' },
  { id: 'sr5', field: 'purpose', type: 'string', required: false, validations: 'max: 140', clientField: 'comment', description: 'Назначение платежа или комментарий отправителя', maskInLogs: false, example: 'Возврат долга за ужин' },
  { id: 'sr6', field: 'clientReferenceId', type: 'string', required: true, validations: 'uuid v4', clientField: 'requestId', description: 'Уникальный сквозной идентификатор транзакции инициатора', maskInLogs: false, example: 'b9d5a371-88f1-4c6e-8271-92b0fa12a4e9' },
  { id: 'sr7', field: 'security.terminalId', type: 'string', required: false, validations: 'length: 8', clientField: 'terminal', description: 'Идентификатор POS/виртуального терминала процессинга', maskInLogs: false, example: 'TERM0042' },
  { id: 'sr8', field: 'security.checkFingerprint', type: 'string', required: false, validations: 'sha256', clientField: 'deviceFingerprint', description: 'Отпечаток клиентского устройства для риск-модуля и антифрода', maskInLogs: true, example: 'e3b0c44298fc1c149afbf4c8996fb924...' }
];

const INITIAL_CLIENT_REQUEST_ROWS: ParameterRow[] = [
  { id: 'cr1', field: 'sourceCard', type: 'string', required: true, validations: 'length: 16', clientField: 'senderCardNumber', description: 'Карта отправителя в мобильном приложении', maskInLogs: true, example: '8600123456789012' },
  { id: 'cr2', field: 'targetCard', type: 'string', required: true, validations: 'length: 16', clientField: 'recipientCardNumber', description: 'Карта получателя средств', maskInLogs: true, example: '8600987654321098' },
  { id: 'cr3', field: 'transferAmount', type: 'number', required: true, validations: 'min: 1000', clientField: 'amount', description: 'Сумма перевода в интерфейсе клиента', maskInLogs: false, example: '250000.00' },
  { id: 'cr4', field: 'currencyCode', type: 'string', required: true, validations: 'UZS', clientField: 'currency', description: 'Код валюты', maskInLogs: false, example: 'UZS' },
  { id: 'cr5', field: 'comment', type: 'string', required: false, validations: 'max: 100', clientField: 'purpose', description: 'Текст комментария для истории операций', maskInLogs: false, example: 'За ужин' },
  { id: 'cr6', field: 'requestId', type: 'string', required: true, validations: 'uuid', clientField: 'clientReferenceId', description: 'Уникальный ID клиентского запроса', maskInLogs: false, example: 'b9d5a371-88f1-4c6e...' }
];

// Response Initial Data (200 OK)
const INITIAL_SERVER_RESPONSE_200: ParameterRow[] = [
  { id: 'sres1', field: 'success', type: 'boolean', required: true, validations: 'true', clientField: 'isSuccess', description: 'Флаг успешности выполнения операции на процессинге', maskInLogs: false, example: 'true' },
  { id: 'sres2', field: 'transactionId', type: 'string', required: true, validations: 'uuid', clientField: 'operationId', description: 'Уникальный номер транзакции в банковском ядре', maskInLogs: false, example: 'tx-20261111-98741' },
  { id: 'sres3', field: 'fee', type: 'number', required: true, validations: 'min: 0', clientField: 'commission', description: 'Сумма удержанной комиссии (тийин)', maskInLogs: false, example: '2500' },
  { id: 'sres4', field: 'balanceAfter', type: 'number', required: false, validations: 'min: 0', clientField: 'currentBalance', description: 'Доступный остаток на карте списания после операции', maskInLogs: true, example: '4972500' },
  { id: 'sres5', field: 'processedAt', type: 'string', required: true, validations: 'iso8601', clientField: 'timestamp', description: 'Точная дата и время авторизации по UTC', maskInLogs: false, example: '2026-11-11T12:30:00Z' }
];

const INITIAL_CLIENT_RESPONSE_200: ParameterRow[] = [
  { id: 'cres1', field: 'isSuccess', type: 'boolean', required: true, validations: 'true', clientField: 'success', description: 'Индикатор успеха для мобильного приложения', maskInLogs: false, example: 'true' },
  { id: 'cres2', field: 'operationId', type: 'string', required: true, validations: 'string', clientField: 'transactionId', description: 'Номер чека/квитанции для отображения клиенту', maskInLogs: false, example: 'tx-20261111-98741' },
  { id: 'cres3', field: 'commission', type: 'number', required: true, validations: 'min: 0', clientField: 'fee', description: 'Размер комиссии в валюте карты', maskInLogs: false, example: '25.00' },
  { id: 'cres4', field: 'timestamp', type: 'string', required: true, validations: 'iso8601', clientField: 'processedAt', description: 'Время операции', maskInLogs: false, example: '2026-11-11T12:30:00Z' }
];

const INITIAL_RESPONSE_400: ParameterRow[] = [
  { id: 'e400_1', field: 'errorCode', type: 'string', required: true, validations: 'enum', clientField: '', description: 'Код ошибки: VALIDATION_FAILED, INSUFFICIENT_FUNDS', maskInLogs: false, example: 'INSUFFICIENT_FUNDS' },
  { id: 'e400_2', field: 'errorMessage', type: 'string', required: true, validations: 'max: 255', clientField: '', description: 'Человекочитаемое описание причины отказа', maskInLogs: false, example: 'Недостаточно средств на карте отправителя' },
  { id: 'e400_3', field: 'details', type: 'object', required: false, validations: 'json', clientField: '', description: 'Детализированные ошибки по полям ввода', maskInLogs: false, example: '{"field": "amount", "limit": 1000000}' }
];

export function RequestResponseDemo() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [viewMode, setViewMode] = useState<'target' | 'legacy'>('target');
  const [templateModel, setTemplateModel] = useState<'dual' | 'single'>('dual');
  const [containerWidth, setContainerWidth] = useState<'full' | 'standard' | 'narrow'>('standard');

  // Request State
  const [reqActiveSide, setReqActiveSide] = useState<'server' | 'client' | 'mapping'>('server');
  const [reqIsImportOpen, setReqIsImportOpen] = useState(false);
  const [reqImportFormat, setReqImportFormat] = useState<'json' | 'curl' | 'xml' | 'schema'>('json');
  const [reqImportTarget, setReqImportTarget] = useState<'server' | 'client'>('server');
  const [reqImportText, setReqImportText] = useState('');
  const [serverReqRows, setServerReqRows] = useState<ParameterRow[]>(INITIAL_SERVER_REQUEST_ROWS);
  const [clientReqRows, setClientReqRows] = useState<ParameterRow[]>(INITIAL_CLIENT_REQUEST_ROWS);
  const [isReqScrolled, setIsReqScrolled] = useState(false);
  const reqTableWrapRef = useRef<HTMLDivElement>(null);

  // Response State
  const [respActiveCode, setRespActiveCode] = useState<'200' | '400' | '500'>('200');
  const [respActiveSide, setRespActiveSide] = useState<'server' | 'client' | 'mapping'>('server');
  const [respIsImportOpen, setRespIsImportOpen] = useState(false);
  const [respImportText, setRespImportText] = useState('');
  const [serverRespRows, setServerRespRows] = useState<ParameterRow[]>(INITIAL_SERVER_RESPONSE_200);
  const [clientRespRows, setClientRespRows] = useState<ParameterRow[]>(INITIAL_CLIENT_RESPONSE_200);
  const [isRespScrolled, setIsRespScrolled] = useState(false);
  const respTableWrapRef = useRef<HTMLDivElement>(null);

  // Legacy Accordion Open/Closed States (for legacy mode)
  const [legacyReqServerOpen, setLegacyReqServerOpen] = useState(true);
  const [legacyReqClientOpen, setLegacyReqClientOpen] = useState(true);
  const [legacyReqMappingOpen, setLegacyReqMappingOpen] = useState(true);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleReqScroll = () => {
    if (!reqTableWrapRef.current) return;
    setIsReqScrolled(reqTableWrapRef.current.scrollLeft > 2);
  };

  const handleRespScroll = () => {
    if (!respTableWrapRef.current) return;
    setIsRespScrolled(respTableWrapRef.current.scrollLeft > 2);
  };

  const handleAddReqRow = (side: 'server' | 'client') => {
    const newId = String(Date.now());
    const newRow: ParameterRow = {
      id: newId,
      field: side === 'client' ? `client_field_${clientReqRows.length + 1}` : `server_field_${serverReqRows.length + 1}`,
      type: 'string',
      required: false,
      validations: '',
      description: 'Новый параметр запроса',
      maskInLogs: false,
      example: ''
    };
    if (side === 'client') {
      setClientReqRows(prev => [...prev, newRow]);
    } else {
      setServerReqRows(prev => [...prev, newRow]);
    }
    showToast(`+ Параметр добавлен в ${side === 'client' ? 'Client' : 'Server'}`);
  };

  const handleAddRespRow = (side: 'server' | 'client') => {
    const newId = String(Date.now());
    const newRow: ParameterRow = {
      id: newId,
      field: side === 'client' ? `res_client_${clientRespRows.length + 1}` : `res_server_${serverRespRows.length + 1}`,
      type: 'string',
      required: false,
      validations: '',
      description: 'Новое поле ответа',
      maskInLogs: false,
      example: ''
    };
    if (side === 'client') {
      setClientRespRows(prev => [...prev, newRow]);
    } else {
      setServerRespRows(prev => [...prev, newRow]);
    }
    showToast(`+ Поле ответа добавлено в ${side === 'client' ? 'Client' : 'Server'}`);
  };

  const handleApplyReqImport = () => {
    if (!reqImportText.trim()) {
      showToast('⚠️ Вставьте текст для импорта');
      return;
    }
    try {
      if (reqImportText.trim().startsWith('{') || reqImportFormat === 'json') {
        const parsed = JSON.parse(reqImportText);
        const keys = Object.keys(parsed);
        const imported: ParameterRow[] = keys.map((key, i) => ({
          id: `imp-${Date.now()}-${i}`,
          field: key,
          type: typeof parsed[key] === 'number' ? 'number' : typeof parsed[key] === 'boolean' ? 'boolean' : 'string',
          required: true,
          validations: '',
          description: `Импортированное поле ${key}`,
          maskInLogs: key.toLowerCase().includes('card') || key.toLowerCase().includes('pass'),
          example: String(parsed[key])
        }));
        if (reqImportTarget === 'server') {
          setServerReqRows(prev => [...prev, ...imported]);
        } else {
          setClientReqRows(prev => [...prev, ...imported]);
        }
        showToast(`✓ Импортировано ${imported.length} полей в ${reqImportTarget === 'server' ? 'Server' : 'Client'}`);
      } else {
        showToast('✓ Данные cURL распарсены');
      }
      setReqIsImportOpen(false);
      setReqImportText('');
    } catch {
      showToast('⚠️ Ошибка разбора JSON');
    }
  };

  const handleAutoMapping = () => {
    let matched = 0;
    setServerReqRows(prev => prev.map(sr => {
      const foundClient = clientReqRows.find(cr =>
        cr.field.toLowerCase() === sr.field.toLowerCase() ||
        (sr.field.includes('Card') && cr.field.includes('Card'))
      );
      if (foundClient) {
        matched++;
        return { ...sr, clientField: foundClient.field };
      }
      return sr;
    }));
    showToast(`⚡ Автоматически сопоставлено: ${matched} полей`);
  };

  // Determine current active request rows
  const currentReqRows = templateModel === 'single'
    ? serverReqRows
    : reqActiveSide === 'server'
      ? serverReqRows
      : reqActiveSide === 'client'
        ? clientReqRows
        : serverReqRows;

  // Determine current active response rows
  const currentRespRows = respActiveCode === '400'
    ? INITIAL_RESPONSE_400
    : respActiveCode === '500'
      ? [
          { id: 'e500_1', field: 'errorCode', type: 'string', required: true, validations: 'GATEWAY_TIMEOUT', clientField: '', description: 'Код ошибки процессинга', maskInLogs: false, example: 'GATEWAY_TIMEOUT' },
          { id: 'e500_2', field: 'message', type: 'string', required: true, validations: '', clientField: '', description: 'Сервис временно недоступен', maskInLogs: false, example: 'External host did not respond in 5000ms' }
        ]
      : templateModel === 'single'
        ? serverRespRows
        : respActiveSide === 'server'
          ? serverRespRows
          : respActiveSide === 'client'
            ? clientRespRows
            : serverRespRows;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--wb-bg-soft)',
      color: 'var(--wb-text)',
      fontFamily: 'var(--wb-font-sans)',
      padding: '20px 24px 80px'
    }}>
      {/* ========================================================================= */}
      {/* TOP CONTROLS & COMPARISON SWITCHER BAR */}
      {/* ========================================================================= */}
      <header style={{
        maxWidth: 1200,
        margin: '0 auto 20px',
        padding: '16px 20px',
        background: 'var(--wb-bg-surface)',
        border: '1px solid var(--wb-border)',
        borderRadius: 'var(--wb-radius)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: 'var(--wb-accent)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4
              }}>
                UI/UX ДЕМО
              </span>
              <h1 style={{ fontSize: 17, margin: 0, fontWeight: 700 }}>
                DocBuilder: Архитектура Request & Response
              </h1>
            </div>
            <p style={{ fontSize: 12, color: 'var(--wb-text-muted)', margin: '4px 0 0' }}>
              Интерактивное сравнение: <strong>Целевой Segmented View</strong> vs <strong>Текущий в проде (Слоёный пирог)</strong>
            </p>
          </div>

          {/* Theme & Width */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Width selector */}
            <div style={{ display: 'inline-flex', background: 'var(--wb-bg-soft)', padding: 2, borderRadius: 6, border: '1px solid var(--wb-border)' }}>
              <button
                type="button"
                onClick={() => setContainerWidth('full')}
                style={{
                  height: 26,
                  padding: '0 8px',
                  border: 0,
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer',
                  background: containerWidth === 'full' ? 'var(--wb-bg-surface)' : 'transparent',
                  color: containerWidth === 'full' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                  fontWeight: containerWidth === 'full' ? 600 : 400
                }}
              >
                100% Широкая
              </button>
              <button
                type="button"
                onClick={() => setContainerWidth('standard')}
                style={{
                  height: 26,
                  padding: '0 8px',
                  border: 0,
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer',
                  background: containerWidth === 'standard' ? 'var(--wb-bg-surface)' : 'transparent',
                  color: containerWidth === 'standard' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                  fontWeight: containerWidth === 'standard' ? 600 : 400
                }}
              >
                1100px Стандарт
              </button>
              <button
                type="button"
                onClick={() => setContainerWidth('narrow')}
                style={{
                  height: 26,
                  padding: '0 8px',
                  border: 0,
                  borderRadius: 4,
                  fontSize: 11,
                  cursor: 'pointer',
                  background: containerWidth === 'narrow' ? 'var(--wb-bg-surface)' : 'transparent',
                  color: containerWidth === 'narrow' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                  fontWeight: containerWidth === 'narrow' ? 600 : 400
                }}
              >
                680px Узкая (тест скролла)
              </button>
            </div>

            <WBButton
              size="sm"
              variant="ghost"
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              icon={<WorkbenchIcon name="highlight" />}
            >
              {theme === 'light' ? '☾ Тёмная' : '☀ Светлая'}
            </WBButton>
          </div>
        </div>

        {/* Big Comparison & Template Switchers */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--wb-border-soft)'
        }}>
          {/* 1. ARCHITECTURE MODE TOGGLE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--wb-text)' }}>
              Режим отображения:
            </span>
            <div style={{
              display: 'inline-flex',
              height: 34,
              padding: 2,
              background: 'var(--wb-bg-soft)',
              borderRadius: 'var(--wb-radius-sm)',
              border: '1px solid var(--wb-border)'
            }}>
              <button
                type="button"
                onClick={() => setViewMode('target')}
                style={{
                  height: 28,
                  padding: '0 14px',
                  borderRadius: 4,
                  border: 0,
                  fontSize: 12,
                  fontWeight: viewMode === 'target' ? 700 : 500,
                  cursor: 'pointer',
                  background: viewMode === 'target' ? '#10b981' : 'transparent',
                  color: viewMode === 'target' ? '#fff' : 'var(--wb-text-muted)',
                  boxShadow: viewMode === 'target' ? '0 1px 3px rgba(16, 185, 129, 0.3)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>✨ Целевой (Segmented View)</span>
                <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.25)', padding: '1px 5px', borderRadius: 10 }}>
                  Рекомендуем
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('legacy')}
                style={{
                  height: 28,
                  padding: '0 14px',
                  borderRadius: 4,
                  border: 0,
                  fontSize: 12,
                  fontWeight: viewMode === 'legacy' ? 700 : 500,
                  cursor: 'pointer',
                  background: viewMode === 'legacy' ? '#ef4444' : 'transparent',
                  color: viewMode === 'legacy' ? '#fff' : 'var(--wb-text-muted)',
                  boxShadow: viewMode === 'legacy' ? '0 1px 3px rgba(239, 68, 68, 0.3)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>⚠️ Текущий в проде (Слоёный пирог)</span>
              </button>
            </div>
          </div>

          {/* 2. TEMPLATE SELECTOR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--wb-text-muted)' }}>
              Шаблон метода:
            </span>
            <div style={{
              display: 'inline-flex',
              height: 32,
              padding: 2,
              background: 'var(--wb-bg-soft)',
              borderRadius: 'var(--wb-radius-sm)',
              border: '1px solid var(--wb-border)'
            }}>
              <button
                type="button"
                onClick={() => { setTemplateModel('dual'); setReqActiveSide('server'); setRespActiveSide('server'); }}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 4,
                  border: 0,
                  fontSize: 11,
                  fontWeight: templateModel === 'dual' ? 600 : 400,
                  cursor: 'pointer',
                  background: templateModel === 'dual' ? 'var(--wb-bg-surface)' : 'transparent',
                  color: templateModel === 'dual' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                  boxShadow: templateModel === 'dual' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                ⚡ Оркестрация (Master + BFF)
              </button>

              <button
                type="button"
                onClick={() => { setTemplateModel('single'); setReqActiveSide('server'); setRespActiveSide('server'); }}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 4,
                  border: 0,
                  fontSize: 11,
                  fontWeight: templateModel === 'single' ? 600 : 400,
                  cursor: 'pointer',
                  background: templateModel === 'single' ? 'var(--wb-bg-surface)' : 'transparent',
                  color: templateModel === 'single' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                  boxShadow: templateModel === 'single' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                🎯 Прямой вызов (Single Contract)
              </button>
            </div>
          </div>
        </div>

        {/* Explain the selected mode banner */}
        <div style={{
          padding: '8px 12px',
          borderRadius: 4,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: viewMode === 'target' ? 'color-mix(in srgb, #10b981 12%, var(--wb-bg-surface))' : 'color-mix(in srgb, #ef4444 12%, var(--wb-bg-surface))',
          color: viewMode === 'target' ? (theme === 'dark' ? '#34d399' : '#065f46') : (theme === 'dark' ? '#f87171' : '#991b1b'),
          border: `1px solid ${viewMode === 'target' ? 'color-mix(in srgb, #10b981 30%, transparent)' : 'color-mix(in srgb, #ef4444 30%, transparent)'}`
        }}>
          {viewMode === 'target' ? (
            <>
              <strong>✨ Целевая архитектура (Segmented View):</strong>
              <span>
                Тулбар на 100% управляет отображением. Активна только выбранная плоскость (Сервер, Клиент или Маппинг). Никаких вложенных аккордеонов и дублирующихся кнопок. Компактно, чисто, фокус на одной задаче.
              </span>
            </>
          ) : (
            <>
              <strong>⚠️ Проблема текущего прода (Слоёный пирог):</strong>
              <span>
                Сверху рендерится Segmented Control, а под ним одновременно раскрыты все 3 аккордеона (`[SERVER]`, `[CLIENT]`, `[MAPPING]`) с дублирующимися кнопками «+ Добавить параметр». Пользователь путается, где именно он редактирует данные.
              </span>
            </>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* METHOD CONTENT CONTAINER */}
      {/* ========================================================================= */}
      <main style={{
        maxWidth: containerWidth === 'full' ? '100%' : containerWidth === 'standard' ? 1100 : 680,
        margin: '0 auto',
        transition: 'max-width 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        {/* Method Header Anchor Card */}
        <div style={{
          padding: '14px 20px',
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <HttpChip method="POST" size="md" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>P2P Перевод между картами</span>
                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--wb-bg-soft)', color: 'var(--wb-text-muted)' }}>
                  v1.4.0
                </span>
              </div>
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--wb-text-muted)' }}>
                <code style={{ fontFamily: 'var(--wb-font-mono)', color: 'var(--wb-text)' }}>/api/v1/cards/transfer</code>
                <span>·</span>
                <span>Списание средств и моментальное зачисление</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              background: templateModel === 'dual' ? 'color-mix(in srgb, var(--wb-accent) 10%, var(--wb-bg-surface))' : 'var(--wb-bg-soft)',
              color: templateModel === 'dual' ? 'var(--wb-accent)' : 'var(--wb-text-muted)',
              border: '1px solid var(--wb-border)'
            }}>
              {templateModel === 'dual' ? 'Оркестрация (Master + BFF)' : 'Прямой вызов (Single)'}
            </span>
            <WBButton size="sm" variant="ghost" icon={<WorkbenchIcon name="copy" />} title="Экспорт Confluence Wiki" />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 1. SECTION: REQUEST */}
        {/* ========================================================================= */}
        <section style={{
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}>
          {/* Section Main Header */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--wb-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WorkbenchIcon name="export" />
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                1. Request (Параметры запроса)
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <WBButton size="sm" variant="ghost" icon={<WorkbenchIcon name="copy" />} title="Копировать JSON схемы" />
              <WBButton size="sm" variant="ghost" icon={<WorkbenchIcon name="more" />} title="Свойства секции" />
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* TARGET VIEW FOR REQUEST */}
          {/* ------------------------------------------------------------- */}
          {viewMode === 'target' ? (
            <>
              {/* TARGET TOOLBAR: 32px height, strictly 1-line */}
              <div style={{
                padding: '10px 20px',
                background: 'var(--wb-bg-surface)',
                borderBottom: '1px solid var(--wb-border-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12
              }}>
                {/* Segmented Control */}
                {templateModel === 'dual' ? (
                  <div style={{
                    display: 'inline-flex',
                    height: 32,
                    padding: 2,
                    background: 'var(--wb-bg-soft)',
                    borderRadius: 'var(--wb-radius-sm)',
                    border: '1px solid var(--wb-border)',
                    alignItems: 'center'
                  }}>
                    <button
                      type="button"
                      onClick={() => { setReqActiveSide('server'); setReqImportTarget('server'); }}
                      style={{
                        height: 26,
                        padding: '0 10px',
                        borderRadius: 4,
                        border: 0,
                        fontSize: 12,
                        fontWeight: reqActiveSide === 'server' ? 600 : 500,
                        cursor: 'pointer',
                        background: reqActiveSide === 'server' ? 'var(--wb-bg-surface)' : 'transparent',
                        color: reqActiveSide === 'server' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                        boxShadow: reqActiveSide === 'server' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <span>Сервер</span>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 10,
                        background: reqActiveSide === 'server' ? 'var(--wb-bg-soft)' : 'transparent',
                        color: 'var(--wb-text-muted)'
                      }}>
                        {serverReqRows.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setReqActiveSide('client'); setReqImportTarget('client'); }}
                      style={{
                        height: 26,
                        padding: '0 10px',
                        borderRadius: 4,
                        border: 0,
                        fontSize: 12,
                        fontWeight: reqActiveSide === 'client' ? 600 : 500,
                        cursor: 'pointer',
                        background: reqActiveSide === 'client' ? 'var(--wb-bg-surface)' : 'transparent',
                        color: reqActiveSide === 'client' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                        boxShadow: reqActiveSide === 'client' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <span>Клиент</span>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 10,
                        background: reqActiveSide === 'client' ? 'var(--wb-bg-soft)' : 'transparent',
                        color: 'var(--wb-text-muted)'
                      }}>
                        {clientReqRows.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReqActiveSide('mapping')}
                      style={{
                        height: 26,
                        padding: '0 10px',
                        borderRadius: 4,
                        border: 0,
                        fontSize: 12,
                        fontWeight: reqActiveSide === 'mapping' ? 600 : 500,
                        cursor: 'pointer',
                        background: reqActiveSide === 'mapping' ? 'var(--wb-bg-surface)' : 'transparent',
                        color: reqActiveSide === 'mapping' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                        boxShadow: reqActiveSide === 'mapping' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <span>Маппинг</span>
                      <span style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 10,
                        background: reqActiveSide === 'mapping' ? 'var(--wb-bg-soft)' : 'transparent',
                        color: 'var(--wb-text-muted)'
                      }}>
                        {serverReqRows.filter(r => r.clientField).length}/{serverReqRows.length}
                      </span>
                    </button>
                  </div>
                ) : (
                  <div style={{
                    display: 'inline-flex',
                    height: 32,
                    padding: '0 12px',
                    background: 'var(--wb-bg-soft)',
                    borderRadius: 'var(--wb-radius-sm)',
                    border: '1px solid var(--wb-border)',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    <span>Контракт</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--wb-bg-surface)', color: 'var(--wb-text-muted)' }}>
                      {serverReqRows.length}
                    </span>
                  </div>
                )}

                {/* Right Action Clustered Buttons (Strict 32px standard) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <WBButton
                    size="sm"
                    variant={reqIsImportOpen ? 'primary' : 'secondary'}
                    onClick={() => setReqIsImportOpen(!reqIsImportOpen)}
                    icon={<WorkbenchIcon name="export" />}
                  >
                    {reqIsImportOpen ? 'Закрыть импорт' : '↓ Импорт'}
                  </WBButton>

                  <WBButton
                    size="sm"
                    variant="ghost"
                    onClick={() => showToast('AI описания сгенерированы')}
                    icon={<WorkbenchIcon name="highlight" />}
                  >
                    Описания
                  </WBButton>

                  <WBButton
                    size="sm"
                    variant="ghost"
                    onClick={() => showToast('Маскирование применено по правилам')}
                    icon={<WorkbenchIcon name="check" />}
                  >
                    Маскирование
                  </WBButton>

                  {reqActiveSide !== 'mapping' ? (
                    <WBButton
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAddReqRow(reqActiveSide === 'client' ? 'client' : 'server')}
                      icon={<WorkbenchIcon name="plus" />}
                    >
                      Параметр
                    </WBButton>
                  ) : (
                    <WBButton
                      size="sm"
                      variant="secondary"
                      onClick={handleAutoMapping}
                      icon={<WorkbenchIcon name="check" />}
                    >
                      Автомаппинг
                    </WBButton>
                  )}
                </div>
              </div>

              {/* INLINE QUICK IMPORT SHUTTER */}
              {reqIsImportOpen && (
                <div style={{
                  background: 'var(--wb-bg-soft)',
                  borderBottom: '1px solid var(--wb-border)',
                  padding: '16px 20px',
                  animation: 'fadeIn 0.2s ease'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Формат:</span>
                      <div style={{ display: 'inline-flex', background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 4, padding: 2 }}>
                        {(['json', 'curl', 'xml', 'schema'] as const).map(fmt => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setReqImportFormat(fmt)}
                            style={{
                              height: 24,
                              padding: '0 8px',
                              border: 0,
                              borderRadius: 3,
                              fontSize: 11,
                              textTransform: 'uppercase',
                              fontWeight: reqImportFormat === fmt ? 600 : 400,
                              cursor: 'pointer',
                              background: reqImportFormat === fmt ? 'var(--wb-bg-hover)' : 'transparent',
                              color: reqImportFormat === fmt ? 'var(--wb-text)' : 'var(--wb-text-muted)'
                            }}
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>

                      {templateModel === 'dual' && (
                        <>
                          <span style={{ margin: '0 4px', color: 'var(--wb-border)' }}>·</span>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Вставить в:</span>
                          <div style={{ display: 'inline-flex', background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 4, padding: 2 }}>
                            <button
                              type="button"
                              onClick={() => setReqImportTarget('server')}
                              style={{
                                height: 24,
                                padding: '0 8px',
                                border: 0,
                                borderRadius: 3,
                                fontSize: 11,
                                cursor: 'pointer',
                                fontWeight: reqImportTarget === 'server' ? 600 : 400,
                                background: reqImportTarget === 'server' ? 'var(--wb-bg-hover)' : 'transparent',
                                color: reqImportTarget === 'server' ? 'var(--wb-text)' : 'var(--wb-text-muted)'
                              }}
                            >
                              Сервер
                            </button>
                            <button
                              type="button"
                              onClick={() => setReqImportTarget('client')}
                              style={{
                                height: 24,
                                padding: '0 8px',
                                border: 0,
                                borderRadius: 3,
                                fontSize: 11,
                                cursor: 'pointer',
                                fontWeight: reqImportTarget === 'client' ? 600 : 400,
                                background: reqImportTarget === 'client' ? 'var(--wb-bg-hover)' : 'transparent',
                                color: reqImportTarget === 'client' ? 'var(--wb-text)' : 'var(--wb-text-muted)'
                              }}
                            >
                              Клиент
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setReqImportFormat('curl');
                          setReqImportText(`curl -X POST https://bank.uz/api/v1/cards/transfer \\\n  -H "Authorization: Bearer eyJhbGciOi..." \\\n  -d '{"senderCard":"86001234...","amount":500000,"currency":"UZS"}'`);
                        }}
                        style={{ fontSize: 11, color: 'var(--wb-accent)', background: 'transparent', border: 0, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Пример cURL
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReqImportFormat('json');
                          setReqImportText(`{\n  "cardToken": "tok_991823",\n  "pinBlock": "1248...",\n  "isUrgent": true\n}`);
                        }}
                        style={{ fontSize: 11, color: 'var(--wb-accent)', background: 'transparent', border: 0, cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Пример JSON
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={reqImportText}
                    onChange={e => setReqImportText(e.target.value)}
                    placeholder="Вставьте JSON payload, cURL запрос, XML или JSON Schema..."
                    rows={4}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      fontFamily: 'var(--wb-font-mono)',
                      fontSize: 12,
                      padding: '8px 12px',
                      borderRadius: 'var(--wb-radius-sm)',
                      border: '1px solid var(--wb-border)',
                      background: 'var(--wb-bg-surface)',
                      color: 'var(--wb-text)',
                      resize: 'vertical'
                    }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                    <WBButton size="sm" variant="ghost" onClick={() => { setReqIsImportOpen(false); setReqImportText(''); }}>
                      Отмена
                    </WBButton>
                    <WBButton size="sm" variant="primary" onClick={handleApplyReqImport} icon={<WorkbenchIcon name="check" />}>
                      Распарсить в таблицу ({reqImportTarget === 'server' ? 'Server' : 'Client'})
                    </WBButton>
                  </div>
                </div>
              )}

              {/* ENDPOINT / HEADERS METADATA SUB-STRIP */}
              {reqActiveSide !== 'mapping' && (
                <div style={{
                  padding: '8px 20px',
                  background: 'var(--wb-bg-soft)',
                  borderBottom: '1px solid var(--wb-border-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--wb-text-muted)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600, color: 'var(--wb-text)' }}>
                      {reqActiveSide === 'client' ? 'Client (BFF) Путь:' : 'Server Эндпоинт:'}
                    </span>
                    <code style={{ fontFamily: 'var(--wb-font-mono)', color: 'var(--wb-text)', background: 'var(--wb-bg-surface)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--wb-border-soft)' }}>
                      {reqActiveSide === 'client' ? 'POST /client-api/v2/cards/transfer' : 'POST /api/v1/cards/transfer'}
                    </code>
                    <span>· REST · application/json</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Заголовков: <strong>{reqActiveSide === 'client' ? '3' : '2'}</strong></span>
                    <span>·</span>
                    <span>Авторизация: <strong>{reqActiveSide === 'client' ? 'Session Token' : 'Bearer JWT'}</strong></span>
                  </div>
                </div>
              )}

              {/* ACTIVE TABLE (SERVER / CLIENT / MAPPING) */}
              {reqActiveSide === 'mapping' ? (
                /* MAPPING MATRIX VIEW */
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: 'var(--wb-text-muted)' }}>
                      Сопоставление параметров: <strong>Клиент (BFF)</strong> ⟷ <strong>Сервер (Master)</strong>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--wb-accent)' }}>
                      Связано {serverReqRows.filter(r => r.clientField).length} из {serverReqRows.length}
                    </span>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)' }}>
                        <th style={{ padding: '8px 12px', fontWeight: 600, width: '35%' }}>Поле Сервера (Master)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', width: '8%', color: 'var(--wb-text-muted)' }}>Связь</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, width: '37%' }}>Поле Клиента (BFF)</th>
                        <th style={{ padding: '8px 12px', fontWeight: 600, width: '20%' }}>Статус маппинга</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serverReqRows.map((sr) => {
                        const isMapped = Boolean(sr.clientField);
                        return (
                          <tr key={sr.id} style={{ borderBottom: '1px solid var(--wb-border-soft)' }}>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <code style={{ fontFamily: 'var(--wb-font-mono)', fontWeight: 600 }}>{sr.field}</code>
                                <span style={{ fontSize: 10, color: 'var(--wb-text-muted)', background: 'var(--wb-bg-soft)', padding: '1px 5px', borderRadius: 3 }}>
                                  {sr.type}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: isMapped ? 'var(--wb-accent)' : 'var(--wb-text-muted)' }}>
                              ⟷
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <select
                                value={sr.clientField || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setServerReqRows(rows => rows.map(r => r.id === sr.id ? { ...r, clientField: val } : r));
                                  showToast(`Привязка: ${sr.field} ↔ ${val || 'пусто'}`);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  borderRadius: 4,
                                  border: `1px solid ${isMapped ? 'var(--wb-border)' : 'var(--wb-accent)'}`,
                                  background: 'var(--wb-bg-surface)',
                                  color: 'var(--wb-text)',
                                  fontSize: 12
                                }}
                              >
                                <option value="">(Не привязано — параметр только на сервере)</option>
                                {clientReqRows.map(cr => (
                                  <option key={cr.id} value={cr.field}>{cr.field} ({cr.type})</option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {isMapped ? (
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: 'color-mix(in srgb, #10b981 12%, var(--wb-bg-surface))',
                                  color: theme === 'dark' ? '#34d399' : '#065f46'
                                }}>
                                  ✓ Связано
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: 'var(--wb-bg-soft)',
                                  color: 'var(--wb-text-muted)'
                                }}>
                                  Внутреннее поле
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* REGULAR PARAMETER TABLE WITH STICKY COLUMN */
                <div
                  ref={reqTableWrapRef}
                  onScroll={handleReqScroll}
                  style={{
                    overflowX: 'auto',
                    maxHeight: 450,
                    overflowY: 'auto',
                    position: 'relative'
                  }}
                >
                  <table style={{
                    width: '100%',
                    minWidth: 1150,
                    tableLayout: 'fixed',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    textAlign: 'left',
                    fontSize: 13
                  }}>
                    <thead>
                      <tr style={{ background: 'var(--wb-bg-soft)' }}>
                        <th style={{
                          position: 'sticky',
                          left: 0,
                          top: 0,
                          zIndex: 30,
                          width: 270,
                          minWidth: 270,
                          padding: '10px 16px',
                          fontWeight: 600,
                          color: 'var(--wb-text)',
                          backgroundColor: theme === 'dark' ? '#181b20' : '#f8f9fa',
                          borderBottom: '1px solid var(--wb-border)',
                          borderRight: isReqScrolled ? '1px solid var(--wb-border)' : '1px solid transparent',
                          boxShadow: isReqScrolled ? '4px 0 8px -2px rgba(0, 0, 0, 0.12)' : 'none',
                          transition: 'box-shadow 0.15s ease'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Поле (Field) 📌</span>
                            <span style={{ fontSize: 10, color: 'var(--wb-text-muted)' }}>липкая колонка</span>
                          </div>
                        </th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 100, padding: '10px 12px', fontWeight: 600 }}>Тип</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 95, padding: '10px 12px', fontWeight: 600 }}>Обязат.</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 190, padding: '10px 12px', fontWeight: 600 }}>Валидации</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', minWidth: 220, padding: '10px 12px', fontWeight: 600 }}>Описание</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 85, padding: '10px 12px', fontWeight: 600 }}>Маска</th>
                        <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 170, padding: '10px 12px', fontWeight: 600 }}>Пример</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentReqRows.map((row, index) => {
                        const rowBg = row.maskInLogs
                          ? (theme === 'dark' ? '#261b0b' : '#fffbeb')
                          : (theme === 'dark' ? '#181b20' : '#ffffff');
                        return (
                          <tr key={row.id} style={{ background: rowBg }}>
                            {/* Sticky Field Cell */}
                            <td style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 5,
                              width: 270,
                              minWidth: 270,
                              padding: '9px 16px',
                              background: rowBg,
                              borderBottom: '1px solid var(--wb-border-soft)',
                              borderRight: isReqScrolled ? '1px solid var(--wb-border)' : '1px solid transparent',
                              boxShadow: isReqScrolled ? '4px 0 8px -2px rgba(0, 0, 0, 0.12)' : 'none',
                              transition: 'box-shadow 0.15s ease'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: 'var(--wb-text-muted)', fontSize: 11 }}>{index + 1}.</span>
                                <code style={{ fontFamily: 'var(--wb-font-mono)', fontWeight: 600, fontSize: 12 }}>
                                  {row.field}
                                </code>
                              </div>
                            </td>

                            <td style={{ padding: '9px 12px', fontFamily: 'var(--wb-font-mono)', fontSize: 12, borderBottom: '1px solid var(--wb-border-soft)' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'var(--wb-bg-soft)',
                                color: row.type === 'number' ? '#099268' : row.type === 'boolean' ? '#ae3ec9' : 'var(--wb-text)'
                              }}>
                                {row.type}
                              </span>
                            </td>

                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--wb-border-soft)' }}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 500,
                                background: row.required ? 'color-mix(in srgb, #ef4444 12%, var(--wb-bg-surface))' : 'var(--wb-bg-soft)',
                                color: row.required ? '#ef4444' : 'var(--wb-text-muted)'
                              }}>
                                {row.required ? 'Да' : 'Нет'}
                              </span>
                            </td>

                            <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--wb-text-muted)', fontFamily: 'var(--wb-font-mono)', borderBottom: '1px solid var(--wb-border-soft)' }}>
                              {row.validations || '—'}
                            </td>

                            <td style={{ padding: '9px 12px', color: 'var(--wb-text-soft)', fontSize: 12, borderBottom: '1px solid var(--wb-border-soft)' }}>
                              {row.description}
                            </td>

                            <td style={{ padding: '9px 12px', textAlign: 'center', borderBottom: '1px solid var(--wb-border-soft)' }}>
                              <input
                                type="checkbox"
                                checked={row.maskInLogs}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  if (reqActiveSide === 'client') {
                                    setClientReqRows(rows => rows.map(r => r.id === row.id ? { ...r, maskInLogs: checked } : r));
                                  } else {
                                    setServerReqRows(rows => rows.map(r => r.id === row.id ? { ...r, maskInLogs: checked } : r));
                                  }
                                }}
                              />
                            </td>

                            <td style={{ padding: '9px 12px', fontFamily: 'var(--wb-font-mono)', fontSize: 11, color: 'var(--wb-text-muted)', borderBottom: '1px solid var(--wb-border-soft)' }}>
                              {row.example || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* FOOTER */}
              <div style={{
                padding: '10px 20px',
                background: 'var(--wb-bg-soft)',
                borderTop: '1px solid var(--wb-border-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'var(--wb-text-muted)'
              }}>
                <span>Всего параметров: <strong>{currentReqRows.length}</strong></span>
                {isReqScrolled && (
                  <span style={{ color: 'var(--wb-accent)' }}>
                    ← Колонка «Поле» зафиксирована при прокрутке
                  </span>
                )}
                <span>Маскирование в логах: <strong>{currentReqRows.filter(r => r.maskInLogs).length}</strong></span>
              </div>
            </>
          ) : (
            /* ------------------------------------------------------------- */
            /* LEGACY "LAYER-CAKE" REPRODUCTION (WHAT CAUSES THE CLUTTER) */
            /* ------------------------------------------------------------- */
            <div style={{ padding: '16px', background: 'var(--wb-bg-soft)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Toolbar still rendered on top */}
              <div style={{
                padding: '8px 12px',
                background: 'var(--wb-bg-surface)',
                border: '1px dashed #ef4444',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={{ height: 26, padding: '0 8px', background: '#e0e7ff', border: 0 }}>Сервер (8)</button>
                  <button style={{ height: 26, padding: '0 8px', background: 'transparent', border: 0 }}>Клиент (6)</button>
                  <button style={{ height: 26, padding: '0 8px', background: 'transparent', border: 0 }}>Маппинг (6/8)</button>
                </div>
                <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                  ⚠️ Тулбар выбран, но ниже РАЗВЁРНУТЫ ВСЕ 3 АККОРДЕОНА:
                </span>
                <button style={{ height: 26, padding: '0 8px' }}>+ Параметр</button>
              </div>

              {/* Accordion 1: Server */}
              <div style={{ border: '1px solid var(--wb-border)', borderRadius: 4, background: 'var(--wb-bg-surface)' }}>
                <div
                  onClick={() => setLegacyReqServerOpen(!legacyReqServerOpen)}
                  style={{ padding: '10px 14px', background: 'var(--wb-bg-soft)', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                  <span>{legacyReqServerOpen ? '▼' : '►'} [SERVER] Серверный контракт (8 параметров)</span>
                  <button style={{ fontSize: 11, padding: '2px 8px' }} onClick={e => { e.stopPropagation(); handleAddReqRow('server'); }}>
                    + Server параметр (дубль кнопки!)
                  </button>
                </div>
                {legacyReqServerOpen && (
                  <div style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, color: 'var(--wb-text-muted)', marginBottom: 8 }}>Таблица полей сервера (8 строк)</div>
                    <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--wb-border-soft)', padding: 8, fontSize: 12, fontFamily: 'var(--wb-font-mono)' }}>
                      {serverReqRows.map(r => <div key={r.id}>• {r.field} ({r.type}) — {r.description}</div>)}
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 2: Client */}
              <div style={{ border: '1px solid var(--wb-border)', borderRadius: 4, background: 'var(--wb-bg-surface)' }}>
                <div
                  onClick={() => setLegacyReqClientOpen(!legacyReqClientOpen)}
                  style={{ padding: '10px 14px', background: 'var(--wb-bg-soft)', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                  <span>{legacyReqClientOpen ? '▼' : '►'} [CLIENT] Клиентский контракт BFF (6 параметров)</span>
                  <button style={{ fontSize: 11, padding: '2px 8px' }} onClick={e => { e.stopPropagation(); handleAddReqRow('client'); }}>
                    + Client параметр (еще один дубль!)
                  </button>
                </div>
                {legacyReqClientOpen && (
                  <div style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, color: 'var(--wb-text-muted)', marginBottom: 8 }}>Таблица полей клиента (6 строк)</div>
                    <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--wb-border-soft)', padding: 8, fontSize: 12, fontFamily: 'var(--wb-font-mono)' }}>
                      {clientReqRows.map(r => <div key={r.id}>• {r.field} ({r.type}) — {r.description}</div>)}
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 3: Mapping */}
              <div style={{ border: '1px solid var(--wb-border)', borderRadius: 4, background: 'var(--wb-bg-surface)' }}>
                <div
                  onClick={() => setLegacyReqMappingOpen(!legacyReqMappingOpen)}
                  style={{ padding: '10px 14px', background: 'var(--wb-bg-soft)', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                >
                  <span>{legacyReqMappingOpen ? '▼' : '►'} [MAPPING] Маппинг Client ↔ Server</span>
                  <span style={{ fontSize: 11, color: 'var(--wb-text-muted)' }}>3-й аккордеон подряд</span>
                </div>
                {legacyReqMappingOpen && (
                  <div style={{ padding: '10px 14px', fontSize: 12 }}>
                    <div>Связка полей Client ↔ Server расположена в отдельном аккордеоне ниже всех таблиц.</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* 2. SECTION: RESPONSE */}
        {/* ========================================================================= */}
        <section style={{
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}>
          {/* Section Main Header */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--wb-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WorkbenchIcon name="export" />
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                2. Response (Формат ответа)
              </h2>
            </div>

            {/* HTTP Status Code Tabs inside Section Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--wb-text-muted)', marginRight: 4 }}>Статус:</span>
              <button
                type="button"
                onClick={() => setRespActiveCode('200')}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: respActiveCode === '200' ? 700 : 500,
                  cursor: 'pointer',
                  border: `1px solid ${respActiveCode === '200' ? '#10b981' : 'var(--wb-border)'}`,
                  background: respActiveCode === '200' ? 'color-mix(in srgb, #10b981 12%, var(--wb-bg-surface))' : 'var(--wb-bg-soft)',
                  color: respActiveCode === '200' ? '#10b981' : 'var(--wb-text-muted)'
                }}
              >
                ● 200 OK
              </button>

              <button
                type="button"
                onClick={() => setRespActiveCode('400')}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: respActiveCode === '400' ? 700 : 500,
                  cursor: 'pointer',
                  border: `1px solid ${respActiveCode === '400' ? '#f59e0b' : 'var(--wb-border)'}`,
                  background: respActiveCode === '400' ? 'color-mix(in srgb, #f59e0b 12%, var(--wb-bg-surface))' : 'var(--wb-bg-soft)',
                  color: respActiveCode === '400' ? '#d97706' : 'var(--wb-text-muted)'
                }}
              >
                ● 400 Bad Request
              </button>

              <button
                type="button"
                onClick={() => setRespActiveCode('500')}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: respActiveCode === '500' ? 700 : 500,
                  cursor: 'pointer',
                  border: `1px solid ${respActiveCode === '500' ? '#ef4444' : 'var(--wb-border)'}`,
                  background: respActiveCode === '500' ? 'color-mix(in srgb, #ef4444 12%, var(--wb-bg-surface))' : 'var(--wb-bg-soft)',
                  color: respActiveCode === '500' ? '#ef4444' : 'var(--wb-text-muted)'
                }}
              >
                ● 500 Error
              </button>

              <WBButton size="sm" variant="ghost" icon={<WorkbenchIcon name="plus" />} title="Добавить HTTP код" />
            </div>
          </div>

          {/* RESPONSE TOOLBAR */}
          <div style={{
            padding: '10px 20px',
            background: 'var(--wb-bg-surface)',
            borderBottom: '1px solid var(--wb-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            {/* Segmented Control for Response (Server / Client / Mapping) if 200 OK and Dual model */}
            {respActiveCode === '200' && templateModel === 'dual' ? (
              <div style={{
                display: 'inline-flex',
                height: 32,
                padding: 2,
                background: 'var(--wb-bg-soft)',
                borderRadius: 'var(--wb-radius-sm)',
                border: '1px solid var(--wb-border)',
                alignItems: 'center'
              }}>
                <button
                  type="button"
                  onClick={() => setRespActiveSide('server')}
                  style={{
                    height: 26,
                    padding: '0 10px',
                    borderRadius: 4,
                    border: 0,
                    fontSize: 12,
                    fontWeight: respActiveSide === 'server' ? 600 : 500,
                    cursor: 'pointer',
                    background: respActiveSide === 'server' ? 'var(--wb-bg-surface)' : 'transparent',
                    color: respActiveSide === 'server' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                    boxShadow: respActiveSide === 'server' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>Сервер</span>
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: respActiveSide === 'server' ? 'var(--wb-bg-soft)' : 'transparent', color: 'var(--wb-text-muted)' }}>
                    {serverRespRows.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRespActiveSide('client')}
                  style={{
                    height: 26,
                    padding: '0 10px',
                    borderRadius: 4,
                    border: 0,
                    fontSize: 12,
                    fontWeight: respActiveSide === 'client' ? 600 : 500,
                    cursor: 'pointer',
                    background: respActiveSide === 'client' ? 'var(--wb-bg-surface)' : 'transparent',
                    color: respActiveSide === 'client' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                    boxShadow: respActiveSide === 'client' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>Клиент</span>
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: respActiveSide === 'client' ? 'var(--wb-bg-soft)' : 'transparent', color: 'var(--wb-text-muted)' }}>
                    {clientRespRows.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRespActiveSide('mapping')}
                  style={{
                    height: 26,
                    padding: '0 10px',
                    borderRadius: 4,
                    border: 0,
                    fontSize: 12,
                    fontWeight: respActiveSide === 'mapping' ? 600 : 500,
                    cursor: 'pointer',
                    background: respActiveSide === 'mapping' ? 'var(--wb-bg-surface)' : 'transparent',
                    color: respActiveSide === 'mapping' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                    boxShadow: respActiveSide === 'mapping' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>Маппинг</span>
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: respActiveSide === 'mapping' ? 'var(--wb-bg-soft)' : 'transparent', color: 'var(--wb-text-muted)' }}>
                    {serverRespRows.filter(r => r.clientField).length}/{serverRespRows.length}
                  </span>
                </button>
              </div>
            ) : (
              <div style={{
                display: 'inline-flex',
                height: 32,
                padding: '0 12px',
                background: 'var(--wb-bg-soft)',
                borderRadius: 'var(--wb-radius-sm)',
                border: '1px solid var(--wb-border)',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600
              }}>
                <span>Тело ответа ({respActiveCode})</span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--wb-bg-surface)', color: 'var(--wb-text-muted)' }}>
                  {currentRespRows.length}
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WBButton
                size="sm"
                variant={respIsImportOpen ? 'primary' : 'secondary'}
                onClick={() => setRespIsImportOpen(!respIsImportOpen)}
                icon={<WorkbenchIcon name="export" />}
              >
                {respIsImportOpen ? 'Закрыть импорт' : '↓ Импорт'}
              </WBButton>

              <WBButton
                size="sm"
                variant="ghost"
                onClick={() => showToast('AI сгенерировал описания полей ответа')}
                icon={<WorkbenchIcon name="highlight" />}
              >
                Описания
              </WBButton>

              <WBButton
                size="sm"
                variant="secondary"
                onClick={() => handleAddRespRow(respActiveSide === 'client' ? 'client' : 'server')}
                icon={<WorkbenchIcon name="plus" />}
              >
                Поле ответа
              </WBButton>
            </div>
          </div>

          {/* RESPONSE IMPORT DRAWER */}
          {respIsImportOpen && (
            <div style={{ background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', padding: '14px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>Импорт JSON ответа сервера ({respActiveCode}):</span>
                <button
                  type="button"
                  onClick={() => setRespImportText(`{\n  "success": true,\n  "transactionId": "tx_2026_demo",\n  "fee": 0,\n  "status": "APPROVED"\n}`)}
                  style={{ fontSize: 11, color: 'var(--wb-accent)', background: 'transparent', border: 0, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Вставить пример ответа
                </button>
              </div>
              <textarea
                value={respImportText}
                onChange={e => setRespImportText(e.target.value)}
                placeholder="Вставьте JSON ответ API..."
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--wb-font-mono)', fontSize: 12, padding: '8px 12px', borderRadius: 4, border: '1px solid var(--wb-border)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <WBButton size="sm" variant="ghost" onClick={() => setRespIsImportOpen(false)}>Отмена</WBButton>
                <WBButton size="sm" variant="primary" onClick={() => { showToast('✓ Ответ успешно распарсен'); setRespIsImportOpen(false); }}>Распарсить</WBButton>
              </div>
            </div>
          )}

          {/* RESPONSE HEADERS STRIP */}
          <div style={{
            padding: '8px 20px',
            background: 'var(--wb-bg-soft)',
            borderBottom: '1px solid var(--wb-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--wb-text-muted)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 600, color: 'var(--wb-text)' }}>Заголовки ответа:</span>
              <code style={{ fontFamily: 'var(--wb-font-mono)', color: 'var(--wb-text)' }}>Content-Type: application/json; charset=utf-8</code>
              <span>·</span>
              <code style={{ fontFamily: 'var(--wb-font-mono)', color: 'var(--wb-text)' }}>Cache-Control: no-store</code>
            </div>
            <span>Формат: <strong>RFC-8259 JSON</strong></span>
          </div>

          {/* RESPONSE PARAMETERS TABLE */}
          <div
            ref={respTableWrapRef}
            onScroll={handleRespScroll}
            style={{
              overflowX: 'auto',
              maxHeight: 400,
              overflowY: 'auto',
              position: 'relative'
            }}
          >
            <table style={{
              width: '100%',
              minWidth: 1050,
              tableLayout: 'fixed',
              borderCollapse: 'separate',
              borderSpacing: 0,
              textAlign: 'left',
              fontSize: 13
            }}>
              <thead>
                <tr style={{ background: 'var(--wb-bg-soft)' }}>
                  <th style={{
                    position: 'sticky',
                    left: 0,
                    top: 0,
                    zIndex: 30,
                    width: 270,
                    minWidth: 270,
                    padding: '10px 16px',
                    fontWeight: 600,
                    color: 'var(--wb-text)',
                    backgroundColor: theme === 'dark' ? '#181b20' : '#f8f9fa',
                    borderBottom: '1px solid var(--wb-border)',
                    borderRight: isRespScrolled ? '1px solid var(--wb-border)' : '1px solid transparent',
                    boxShadow: isRespScrolled ? '4px 0 8px -2px rgba(0, 0, 0, 0.12)' : 'none',
                    transition: 'box-shadow 0.15s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Поле (Response Field) 📌</span>
                      <span style={{ fontSize: 10, color: 'var(--wb-text-muted)' }}>липкая колонка</span>
                    </div>
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 110, padding: '10px 12px', fontWeight: 600 }}>Тип</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 95, padding: '10px 12px', fontWeight: 600 }}>Обязат.</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', minWidth: 260, padding: '10px 12px', fontWeight: 600 }}>Описание поля ответа</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 90, padding: '10px 12px', fontWeight: 600 }}>Маска</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 200, padding: '10px 12px', fontWeight: 600 }}>Пример значения</th>
                </tr>
              </thead>
              <tbody>
                {currentRespRows.map((row, index) => {
                  const rowBg = row.maskInLogs
                    ? (theme === 'dark' ? '#261b0b' : '#fffbeb')
                    : (theme === 'dark' ? '#181b20' : '#ffffff');
                  return (
                    <tr key={row.id} style={{ background: rowBg }}>
                      <td style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 5,
                        width: 270,
                        minWidth: 270,
                        padding: '9px 16px',
                        background: rowBg,
                        borderBottom: '1px solid var(--wb-border-soft)',
                        borderRight: isRespScrolled ? '1px solid var(--wb-border)' : '1px solid transparent',
                        boxShadow: isRespScrolled ? '4px 0 8px -2px rgba(0, 0, 0, 0.12)' : 'none'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--wb-text-muted)', fontSize: 11 }}>{index + 1}.</span>
                          <code style={{ fontFamily: 'var(--wb-font-mono)', fontWeight: 600, fontSize: 12 }}>
                            {row.field}
                          </code>
                        </div>
                      </td>

                      <td style={{ padding: '9px 12px', fontFamily: 'var(--wb-font-mono)', fontSize: 12, borderBottom: '1px solid var(--wb-border-soft)' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'var(--wb-bg-soft)',
                          color: row.type === 'number' ? '#099268' : row.type === 'boolean' ? '#ae3ec9' : 'var(--wb-text)'
                        }}>
                          {row.type}
                        </span>
                      </td>

                      <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--wb-border-soft)' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: row.required ? 'color-mix(in srgb, #10b981 12%, var(--wb-bg-surface))' : 'var(--wb-bg-soft)',
                          color: row.required ? '#10b981' : 'var(--wb-text-muted)'
                        }}>
                          {row.required ? 'Да' : 'Нет'}
                        </span>
                      </td>

                      <td style={{ padding: '9px 12px', color: 'var(--wb-text-soft)', fontSize: 12, borderBottom: '1px solid var(--wb-border-soft)' }}>
                        {row.description}
                      </td>

                      <td style={{ padding: '9px 12px', textAlign: 'center', borderBottom: '1px solid var(--wb-border-soft)' }}>
                        <input
                          type="checkbox"
                          checked={row.maskInLogs}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            if (respActiveSide === 'client') {
                              setClientRespRows(rows => rows.map(r => r.id === row.id ? { ...r, maskInLogs: checked } : r));
                            } else {
                              setServerRespRows(rows => rows.map(r => r.id === row.id ? { ...r, maskInLogs: checked } : r));
                            }
                          }}
                        />
                      </td>

                      <td style={{ padding: '9px 12px', fontFamily: 'var(--wb-font-mono)', fontSize: 11, color: 'var(--wb-text-muted)', borderBottom: '1px solid var(--wb-border-soft)' }}>
                        {row.example || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* RESPONSE FOOTER */}
          <div style={{
            padding: '10px 20px',
            background: 'var(--wb-bg-soft)',
            borderTop: '1px solid var(--wb-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: 'var(--wb-text-muted)'
          }}>
            <span>Всего полей ответа ({respActiveCode}): <strong>{currentRespRows.length}</strong></span>
            <span>Чувствительных данных (маска): <strong>{currentRespRows.filter(r => r.maskInLogs).length}</strong></span>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* EXPLANATORY CALLOUT CARD */}
        {/* ========================================================================= */}
        <section style={{
          padding: '16px 20px',
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius)',
          fontSize: 13,
          lineHeight: 1.6
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>💡 Как работает целевая концепция:</span>
          </h3>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--wb-text-soft)' }}>
            <li>
              <strong>Единый фокус внимания:</strong> Пользователь выбирает вкладку <code>Сервер</code>, <code>Клиент</code> или <code>Маппинг</code> в Segmented Control. На экране отображается <em>ровно одна</em> таблица и её эндпоинт. Нет вертикальной простыни из 3 раскрытых секций.
            </li>
            <li>
              <strong>Адаптивность к типу метода:</strong> Для <em>Оркестрации</em> доступны обе стороны и матрица маппинга. Для <em>Прямого вызова</em> отображается единый контракт без лишних вкладок и путаницы.
            </li>
            <li>
              <strong>Сквозная липкая колонка «Поле»:</strong> При горизонтальном скролле длинных таблиц (валидации, описания, маскирование) имя поля всегда зафиксировано слева с мягкой полупрозрачной тенью.
            </li>
            <li>
              <strong>Быстрый импорт шторкой:</strong> Импорт cURL / JSON открывается плавной шторкой прямо внутри секции — без перекрывающих модальных окон.
            </li>
            <li>
              <strong>Симметрия Request и Response:</strong> Секция ответа (Response) имеет точно такую же строгую структуру с выбором HTTP-статусов (200, 400, 500) и единым стандартом кнопок высотой 32px.
            </li>
          </ul>
        </section>
      </main>

      {/* Floating Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'var(--wb-text)',
          color: 'var(--wb-bg-surface)',
          padding: '10px 16px',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: 13,
          fontWeight: 500,
          zIndex: 100,
          animation: 'fadeIn 0.2s ease'
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<RequestResponseDemo />);
