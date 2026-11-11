import { useState, useRef, useEffect, type ReactNode } from 'react';
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

const INITIAL_SERVER_ROWS: ParameterRow[] = [
  { id: '1', field: 'senderCardNumber', type: 'string', required: true, validations: 'regex(^\\d{16}$)', clientField: 'sourceCard', description: 'Номер карты списания (16 цифр)', maskInLogs: true, example: '8600123456789012' },
  { id: '2', field: 'recipientCardNumber', type: 'string', required: true, validations: 'regex(^\\d{16}$)', clientField: 'targetCard', description: 'Номер карты зачисления получателя', maskInLogs: true, example: '8600987654321098' },
  { id: '3', field: 'amount', type: 'number', required: true, validations: 'min: 1000, max: 50000000', clientField: 'transferAmount', description: 'Сумма перевода в тийинах / базовой валюте', maskInLogs: false, example: '25000000' },
  { id: '4', field: 'currency', type: 'string', required: true, validations: 'in: UZS, USD, EUR', clientField: 'currencyCode', description: 'Буквенный код валюты операции по ISO-4217', maskInLogs: false, example: 'UZS' },
  { id: '5', field: 'purpose', type: 'string', required: false, validations: 'max: 140', clientField: 'comment', description: 'Назначение платежа или комментарий отправителя', maskInLogs: false, example: 'Возврат долга за ужин' },
  { id: '6', field: 'clientReferenceId', type: 'string', required: true, validations: 'uuid v4', clientField: 'requestId', description: 'Уникальный сквозной идентификатор транзакции инициатора', maskInLogs: false, example: 'b9d5a371-88f1-4c6e-8271-92b0fa12a4e9' },
  { id: '7', field: 'security.terminalId', type: 'string', required: false, validations: 'length: 8', clientField: 'terminal', description: 'Идентификатор POS/виртуального терминала процессинга', maskInLogs: false, example: 'TERM0042' },
  { id: '8', field: 'security.checkFingerprint', type: 'string', required: false, validations: 'sha256', clientField: 'deviceFingerprint', description: 'Отпечаток клиентского устройства для риск-модуля и антифрода', maskInLogs: true, example: 'e3b0c44298fc1c149afbf4c8996fb924...' }
];

const INITIAL_CLIENT_ROWS: ParameterRow[] = [
  { id: 'c1', field: 'sourceCard', type: 'string', required: true, validations: 'length: 16', clientField: 'senderCardNumber', description: 'Карта отправителя в мобильном приложении', maskInLogs: true, example: '8600123456789012' },
  { id: 'c2', field: 'targetCard', type: 'string', required: true, validations: 'length: 16', clientField: 'recipientCardNumber', description: 'Карта получателя средств', maskInLogs: true, example: '8600987654321098' },
  { id: 'c3', field: 'transferAmount', type: 'number', required: true, validations: 'min: 1000', clientField: 'amount', description: 'Сумма перевода в интерфейсе клиента', maskInLogs: false, example: '250000.00' },
  { id: 'c4', field: 'currencyCode', type: 'string', required: true, validations: 'UZS', clientField: 'currency', description: 'Код валюты', maskInLogs: false, example: 'UZS' },
  { id: 'c5', field: 'comment', type: 'string', required: false, validations: 'max: 100', clientField: 'purpose', description: 'Текст комментария для истории операций', maskInLogs: false, example: 'За ужин' },
  { id: 'c6', field: 'requestId', type: 'string', required: true, validations: 'uuid', clientField: 'clientReferenceId', description: 'Уникальный ID клиентского запроса', maskInLogs: false, example: 'b9d5a371-88f1-4c6e...' }
];

export function RequestResponseDemo() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeSide, setActiveSide] = useState<'server' | 'client' | 'mapping'>('server');
  const [containerWidth, setContainerWidth] = useState<'full' | 'standard' | 'narrow'>('standard');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<'json' | 'curl' | 'xml' | 'schema'>('json');
  const [importTarget, setImportTarget] = useState<'server' | 'client'>('server');
  const [importText, setImportText] = useState('');
  const [serverRows, setServerRows] = useState<ParameterRow[]>(INITIAL_SERVER_ROWS);
  const [clientRows, setClientRows] = useState<ParameterRow[]>(INITIAL_CLIENT_ROWS);
  const [toast, setToast] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const tableWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleTableScroll = () => {
    if (!tableWrapRef.current) return;
    setIsScrolled(tableWrapRef.current.scrollLeft > 2);
  };

  const currentRows = activeSide === 'server' ? serverRows : activeSide === 'client' ? clientRows : serverRows;

  const handleAddRow = () => {
    const newId = String(Date.now());
    const newRow: ParameterRow = {
      id: newId,
      field: activeSide === 'client' ? `param_${clientRows.length + 1}` : `field_${serverRows.length + 1}`,
      type: 'string',
      required: false,
      validations: '',
      description: 'Новый параметр',
      maskInLogs: false,
      example: ''
    };
    if (activeSide === 'client') {
      setClientRows([...clientRows, newRow]);
    } else {
      setServerRows([...serverRows, newRow]);
    }
    showToast(`+ Параметр добавлен в ${activeSide === 'client' ? 'Client' : 'Server'}`);
  };

  const handleApplyImport = () => {
    if (!importText.trim()) {
      showToast('⚠️ Вставьте текст для импорта');
      return;
    }
    try {
      if (importFormat === 'json' || importText.trim().startsWith('{')) {
        const parsed = JSON.parse(importText);
        const keys = Object.keys(parsed);
        const importedRows: ParameterRow[] = keys.map((key, i) => ({
          id: `imp-${Date.now()}-${i}`,
          field: key,
          type: typeof parsed[key] === 'number' ? 'number' : typeof parsed[key] === 'boolean' ? 'boolean' : 'string',
          required: true,
          validations: '',
          description: `Импортированное поле ${key}`,
          maskInLogs: key.toLowerCase().includes('card') || key.toLowerCase().includes('pass') || key.toLowerCase().includes('secret'),
          example: String(parsed[key])
        }));

        if (importTarget === 'server') {
          setServerRows(prev => [...prev, ...importedRows]);
        } else {
          setClientRows(prev => [...prev, ...importedRows]);
        }
        showToast(`✓ Импортировано ${importedRows.length} полей в ${importTarget === 'server' ? 'Server' : 'Client'}`);
      } else {
        showToast('✓ Данные cURL / Schema распарсены');
      }
      setIsImportOpen(false);
      setImportText('');
    } catch {
      showToast('⚠️ Ошибка парсинга JSON');
    }
  };

  const insertSampleCurl = () => {
    setImportFormat('curl');
    setImportText(`curl -X POST https://api.bank.uz/api/v1/cards/transfer \\
  -H "Authorization: Bearer eyJhbGciOi..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "senderCardNumber": "8600123456789012",
    "recipientCardNumber": "8600987654321098",
    "amount": 500000,
    "currency": "UZS",
    "purpose": "Оплата услуг"
  }'`);
  };

  const insertSampleJson = () => {
    setImportFormat('json');
    setImportText(`{\n  "transactionToken": "tx_998124_abc",\n  "feeAmount": 2500,\n  "confirmationCode": "1234",\n  "isExpress": true\n}`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--wb-bg-soft)',
      color: 'var(--wb-text)',
      fontFamily: 'var(--wb-font-sans)',
      padding: '24px 32px'
    }}>
      {/* Top Demo Bar */}
      <header style={{
        maxWidth: 1100,
        margin: '0 auto 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--wb-bg-surface)',
        border: '1px solid var(--wb-border)',
        borderRadius: 'var(--wb-radius)'
      }}>
        <div>
          <h1 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>
            Демо: Тулбар Request / Response, Быстрый импорт и Липкая колонка
          </h1>
          <p style={{ fontSize: 12, color: 'var(--wb-text-muted)', margin: '4px 0 0' }}>
            Интерактивный макет для согласования UI/UX параметров и сопоставления контрактов
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', background: 'var(--wb-bg-soft)', padding: 2, borderRadius: 6, border: '1px solid var(--wb-border)' }}>
            <button
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
              1000px Стандарт
            </button>
            <button
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
      </header>

      {/* Main Container */}
      <main style={{
        maxWidth: containerWidth === 'full' ? '100%' : containerWidth === 'standard' ? 1100 : 680,
        margin: '0 auto',
        transition: 'max-width 0.2s ease'
      }}>
        {/* Method Header Mock */}
        <div style={{
          padding: '16px 20px',
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius)',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <HttpChip method="POST" size="md" />
            <div>
              <span style={{ fontWeight: 600, fontSize: 16 }}>P2P Перевод между картами</span>
              <span style={{ margin: '0 8px', color: 'var(--wb-border)' }}>·</span>
              <code style={{ fontSize: 13, color: 'var(--wb-text-muted)', fontFamily: 'var(--wb-font-mono)' }}>/api/v1/cards/transfer</code>
            </div>
          </div>
          <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: 'var(--wb-bg-soft)', color: 'var(--wb-text-soft)' }}>
            Оркестрация (Master + BFF)
          </span>
        </div>

        {/* SECTION CARD: Request */}
        <section style={{
          background: 'var(--wb-bg-surface)',
          border: '1px solid var(--wb-border)',
          borderRadius: 'var(--wb-radius)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden'
        }}>
          {/* Section Header */}
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--wb-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WorkbenchIcon name="export" />
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Request (Параметры запроса)</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <WBButton size="sm" variant="ghost" icon={<WorkbenchIcon name="copy" />} title="Копировать секцию" />
              <WBButton size="sm" variant="ghost" icon={<WorkbenchIcon name="more" />} title="Дополнительно" />
            </div>
          </div>

          {/* NEW TOOLBAR: Segmented Control + Actions */}
          <div style={{
            padding: '12px 20px',
            background: 'var(--wb-bg-surface)',
            borderBottom: '1px solid var(--wb-border-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            {/* Segmented Control */}
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
                onClick={() => { setActiveSide('server'); setImportTarget('server'); }}
                style={{
                  height: 26,
                  padding: '0 12px',
                  borderRadius: 4,
                  border: 0,
                  fontSize: 12,
                  fontWeight: activeSide === 'server' ? 600 : 500,
                  cursor: 'pointer',
                  background: activeSide === 'server' ? 'var(--wb-bg-surface)' : 'transparent',
                  color: activeSide === 'server' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                  boxShadow: activeSide === 'server' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>Сервер (Master)</span>
                <span style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 10,
                  background: activeSide === 'server' ? 'var(--wb-bg-soft)' : 'transparent',
                  color: 'var(--wb-text-muted)'
                }}>
                  {serverRows.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveSide('client'); setImportTarget('client'); }}
                style={{
                  height: 26,
                  padding: '0 12px',
                  borderRadius: 4,
                  border: 0,
                  fontSize: 12,
                  fontWeight: activeSide === 'client' ? 600 : 500,
                  cursor: 'pointer',
                  background: activeSide === 'client' ? 'var(--wb-bg-surface)' : 'transparent',
                  color: activeSide === 'client' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                  boxShadow: activeSide === 'client' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>Клиент (BFF)</span>
                <span style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 10,
                  background: activeSide === 'client' ? 'var(--wb-bg-soft)' : 'transparent',
                  color: 'var(--wb-text-muted)'
                }}>
                  {clientRows.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSide('mapping')}
                style={{
                  height: 26,
                  padding: '0 12px',
                  borderRadius: 4,
                  border: 0,
                  fontSize: 12,
                  fontWeight: activeSide === 'mapping' ? 600 : 500,
                  cursor: 'pointer',
                  background: activeSide === 'mapping' ? 'var(--wb-bg-surface)' : 'transparent',
                  color: activeSide === 'mapping' ? 'var(--wb-text)' : 'var(--wb-text-muted)',
                  boxShadow: activeSide === 'mapping' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
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
                  background: activeSide === 'mapping' ? 'var(--wb-bg-soft)' : 'transparent',
                  color: 'var(--wb-text-muted)'
                }}>
                  {serverRows.filter(r => r.clientField).length}/{serverRows.length}
                </span>
              </button>
            </div>

            {/* Action Buttons Clustered on Right (Strict 32px standard) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WBButton
                size="sm"
                variant={isImportOpen ? 'primary' : 'secondary'}
                onClick={() => setIsImportOpen(!isImportOpen)}
                icon={<WorkbenchIcon name="export" />}
              >
                {isImportOpen ? 'Закрыть импорт' : '↓ Импорт'}
              </WBButton>

              <WBButton
                size="sm"
                variant="ghost"
                onClick={() => showToast('AI описания заполнены для всех полей')}
                icon={<WorkbenchIcon name="highlight" />}
              >
                Описания
              </WBButton>

              <WBButton
                size="sm"
                variant="ghost"
                onClick={() => showToast('Маскирование применено по правилам безопасности')}
                icon={<WorkbenchIcon name="check" />}
              >
                Маскирование
              </WBButton>

              <WBButton
                size="sm"
                variant="secondary"
                onClick={handleAddRow}
                icon={<WorkbenchIcon name="plus" />}
              >
                Параметр
              </WBButton>
            </div>
          </div>

          {/* QUICK INLINE IMPORT ACCORDION / SHUTTER */}
          {isImportOpen && (
            <div style={{
              background: 'var(--wb-bg-soft)',
              borderBottom: '1px solid var(--wb-border)',
              padding: '16px 20px',
              animation: 'fadeIn 0.2s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Формат источника:</span>
                  <div style={{ display: 'inline-flex', background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 4, padding: 2 }}>
                    {(['json', 'curl', 'xml', 'schema'] as const).map(fmt => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setImportFormat(fmt)}
                        style={{
                          height: 24,
                          padding: '0 8px',
                          border: 0,
                          borderRadius: 3,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          fontWeight: importFormat === fmt ? 600 : 400,
                          cursor: 'pointer',
                          background: importFormat === fmt ? 'var(--wb-bg-hover)' : 'transparent',
                          color: importFormat === fmt ? 'var(--wb-text)' : 'var(--wb-text-muted)'
                        }}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>

                  <span style={{ margin: '0 4px', color: 'var(--wb-border)' }}>·</span>

                  <span style={{ fontSize: 13, fontWeight: 600 }}>Вставить в:</span>
                  <div style={{ display: 'inline-flex', background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 4, padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => setImportTarget('server')}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        border: 0,
                        borderRadius: 3,
                        fontSize: 11,
                        cursor: 'pointer',
                        fontWeight: importTarget === 'server' ? 600 : 400,
                        background: importTarget === 'server' ? 'var(--wb-bg-hover)' : 'transparent',
                        color: importTarget === 'server' ? 'var(--wb-text)' : 'var(--wb-text-muted)'
                      }}
                    >
                      Сервер
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportTarget('client')}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        border: 0,
                        borderRadius: 3,
                        fontSize: 11,
                        cursor: 'pointer',
                        fontWeight: importTarget === 'client' ? 600 : 400,
                        background: importTarget === 'client' ? 'var(--wb-bg-hover)' : 'transparent',
                        color: importTarget === 'client' ? 'var(--wb-text)' : 'var(--wb-text-muted)'
                      }}
                    >
                      Клиент
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={insertSampleCurl}
                    style={{ fontSize: 11, color: 'var(--wb-accent)', background: 'transparent', border: 0, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Вставить демо cURL
                  </button>
                  <button
                    type="button"
                    onClick={insertSampleJson}
                    style={{ fontSize: 11, color: 'var(--wb-accent)', background: 'transparent', border: 0, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Вставить демо JSON
                  </button>
                </div>
              </div>

              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="Вставьте сюда JSON payload, cURL запрос, XML или JSON Schema..."
                rows={5}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--wb-font-mono)',
                  fontSize: 12,
                  padding: '10px 12px',
                  borderRadius: 'var(--wb-radius-sm)',
                  border: '1px solid var(--wb-border)',
                  background: 'var(--wb-bg-surface)',
                  color: 'var(--wb-text)',
                  resize: 'vertical'
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <WBButton size="sm" variant="ghost" onClick={() => { setIsImportOpen(false); setImportText(''); }}>
                  Отмена
                </WBButton>
                <WBButton size="sm" variant="primary" onClick={handleApplyImport} icon={<WorkbenchIcon name="check" />}>
                  Распарсить в таблицу ({importTarget === 'server' ? 'Server' : 'Client'})
                </WBButton>
              </div>
            </div>
          )}

          {/* METADATA STRIP: Endpoint, Protocol, Headers preview */}
          {activeSide !== 'mapping' && (
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
                <span style={{ fontWeight: 600, color: 'var(--wb-text)' }}>
                  {activeSide === 'server' ? 'Server Endpoint:' : 'Client Endpoint:'}
                </span>
                <code style={{ fontFamily: 'var(--wb-font-mono)', color: 'var(--wb-text)' }}>
                  {activeSide === 'server' ? 'POST /api/v1/cards/transfer' : 'POST /client-api/p2p/send'}
                </code>
                <span>· REST · JSON</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Заголовков: <strong>{activeSide === 'server' ? '2' : '3'}</strong></span>
                <span>·</span>
                <span>Авторизация: <strong>{activeSide === 'server' ? 'Bearer Token' : 'API Key'}</strong></span>
              </div>
            </div>
          )}

          {/* PARAMETERS TABLE WITH STICKY FIELD COLUMN */}
          <div
            ref={tableWrapRef}
            data-testid="table-scroll-container"
            onScroll={handleTableScroll}
            style={{
              overflowX: 'auto',
              maxHeight: 520,
              overflowY: 'auto',
              position: 'relative'
            }}
          >
            <table style={{
              width: '100%',
              minWidth: 1200,
              tableLayout: 'fixed',
              borderCollapse: 'separate',
              borderSpacing: 0,
              textAlign: 'left',
              fontSize: 13
            }}>
              <thead>
                <tr style={{
                  background: 'var(--wb-bg-soft)',
                  borderBottom: '1px solid var(--wb-border)'
                }}>
                  {/* Sticky Field Header */}
                  <th style={{
                    position: 'sticky',
                    left: 0,
                    top: 0,
                    zIndex: 30,
                    width: 280,
                    minWidth: 280,
                    padding: '10px 16px',
                    fontWeight: 600,
                    color: 'var(--wb-text)',
                    backgroundColor: theme === 'dark' ? '#1a1f2c' : '#f5f0e6',
                    borderBottom: '1px solid var(--wb-border)',
                    borderRight: isScrolled ? '1px solid var(--wb-border)' : '1px solid transparent',
                    boxShadow: isScrolled ? '4px 0 8px -2px rgba(0, 0, 0, 0.15)' : 'none',
                    transition: 'box-shadow 0.15s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>Поле (Field) 📌</span>
                      <span style={{ fontSize: 10, color: 'var(--wb-text-muted)' }}>закреплено</span>
                    </div>
                  </th>

                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 110, padding: '10px 12px', fontWeight: 600 }}>Тип</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 110, padding: '10px 12px', fontWeight: 600 }}>Обязат.</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 190, padding: '10px 12px', fontWeight: 600 }}>Валидации</th>
                  {activeSide === 'mapping' && (
                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 240, padding: '10px 12px', fontWeight: 600, color: 'var(--wb-accent)' }}>
                      Маппинг на Client поле
                    </th>
                  )}
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', minWidth: 240, padding: '10px 12px', fontWeight: 600 }}>Описание</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 90, padding: '10px 12px', fontWeight: 600 }}>Маска</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--wb-bg-soft)', borderBottom: '1px solid var(--wb-border)', width: 180, padding: '10px 12px', fontWeight: 600 }}>Пример</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, index) => {
                  const isMasked = row.maskInLogs;
                  const rowBg = isMasked
                    ? (theme === 'dark' ? '#261b0b' : '#fffbeb')
                    : (theme === 'dark' ? '#181b20' : '#ffffff');
                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: rowBg
                      }}
                    >
                      {/* Sticky Field Cell */}
                      <td style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 5,
                        width: 280,
                        minWidth: 280,
                        padding: '9px 16px',
                        background: rowBg,
                        borderBottom: '1px solid var(--wb-border-soft)',
                        borderRight: isScrolled ? '1px solid var(--wb-border)' : '1px solid transparent',
                        boxShadow: isScrolled ? '4px 0 8px -2px rgba(0, 0, 0, 0.15)' : 'none',
                        transition: 'box-shadow 0.15s ease'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--wb-text-muted)', fontSize: 11 }}>{index + 1}.</span>
                          <span style={{ fontFamily: 'var(--wb-font-mono)', fontWeight: 600, fontSize: 12 }}>
                            {row.field}
                          </span>
                        </div>
                      </td>

                      {/* Other cells */}
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
                          background: row.required ? 'color-mix(in srgb, var(--wb-danger, #ef4444) 12%, var(--wb-bg-surface))' : 'var(--wb-bg-soft)',
                          color: row.required ? 'var(--wb-danger, #ef4444)' : 'var(--wb-text-muted)'
                        }}>
                          {row.required ? 'Да' : 'Нет'}
                        </span>
                      </td>

                      <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--wb-text-muted)', fontFamily: 'var(--wb-font-mono)', borderBottom: '1px solid var(--wb-border-soft)' }}>
                        {row.validations || '—'}
                      </td>

                      {activeSide === 'mapping' && (
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--wb-border-soft)' }}>
                          <select
                            value={row.clientField || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setServerRows(rows => rows.map(r => r.id === row.id ? { ...r, clientField: val } : r));
                              showToast(`Маппинг обновлен: ${row.field} ↔ ${val || 'не привязано'}`);
                            }}
                            style={{
                              width: '100%',
                              padding: '4px 8px',
                              borderRadius: 4,
                              border: '1px solid var(--wb-border)',
                              background: 'var(--wb-bg-surface)',
                              color: 'var(--wb-text)',
                              fontSize: 12
                            }}
                          >
                            <option value="">(Не привязано)</option>
                            {clientRows.map(cr => (
                              <option key={cr.id} value={cr.field}>{cr.field} ({cr.type})</option>
                            ))}
                          </select>
                        </td>
                      )}

                      <td style={{ padding: '9px 12px', color: 'var(--wb-text-soft)', fontSize: 12, borderBottom: '1px solid var(--wb-border-soft)' }}>
                        {row.description}
                      </td>

                      <td style={{ padding: '9px 12px', textAlign: 'center', borderBottom: '1px solid var(--wb-border-soft)' }}>
                        <input
                          type="checkbox"
                          checked={row.maskInLogs}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            if (activeSide === 'client') {
                              setClientRows(rows => rows.map(r => r.id === row.id ? { ...r, maskInLogs: checked } : r));
                            } else {
                              setServerRows(rows => rows.map(r => r.id === row.id ? { ...r, maskInLogs: checked } : r));
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

          {/* Table Footer */}
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
            <span>Всего параметров: <strong>{currentRows.length}</strong></span>
            {isScrolled && (
              <span style={{ color: 'var(--wb-accent)' }}>
                ← Колонка «Поле» зафиксирована, прокручивайте для просмотра всех свойств
              </span>
            )}
            <span>Строк с маскированием: <strong>{currentRows.filter(r => r.maskInLogs).length}</strong></span>
          </div>
        </section>
      </main>

      {/* Toast Notification */}
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
