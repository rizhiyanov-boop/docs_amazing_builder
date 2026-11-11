import { useState, type ReactNode } from 'react';
import type { ParseFormat } from '../types';
import { WBButton } from './primitives/WorkbenchPrimitives';
import { WorkbenchIcon } from './workbench/WorkbenchIcon';

export type ParseTarget = 'server' | 'client';
export type QuickImportFormat = ParseFormat | 'schema';

export type RequestQuickImportProps = {
  initialFormat?: QuickImportFormat;
  initialTarget?: ParseTarget;
  isDualModel: boolean;
  onApply: (text: string, format: QuickImportFormat, target: ParseTarget) => void;
  onCancel: () => void;
  error?: string;
};

export function RequestQuickImport({
  initialFormat = 'json',
  initialTarget = 'server',
  isDualModel,
  onApply,
  onCancel,
  error
}: RequestQuickImportProps): ReactNode {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<QuickImportFormat>(initialFormat);
  const [target, setTarget] = useState<ParseTarget>(initialTarget);
  const [localError, setLocalError] = useState<string>('');

  const handleTextChange = (val: string) => {
    setText(val);
    if (localError) setLocalError('');

    // Auto-detect format
    const trimmed = val.trim();
    if (trimmed.startsWith('curl ') || trimmed.startsWith('curl\n')) {
      setFormat('curl');
    } else if (trimmed.startsWith('<')) {
      setFormat('xml');
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      if (trimmed.includes('"$schema"') || trimmed.includes('"properties"')) {
        setFormat('schema');
      } else {
        setFormat('json');
      }
    }
  };

  const handleApply = () => {
    const raw = text.trim();
    if (!raw) {
      setLocalError('Вставьте JSON, cURL, XML или JSON Schema для импорта');
      return;
    }
    onApply(raw, format, target);
  };

  return (
    <div className="cf-quick-import-panel">
      <div className="cf-quick-import-header">
        <div className="cf-quick-import-selectors">
          <span className="cf-quick-import-label">Формат:</span>
          <div className="cf-quick-import-btn-group" role="group" aria-label="Формат импорта">
            {(['json', 'curl', 'xml', 'schema'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                className={`cf-quick-import-tab ${format === fmt ? 'is-active' : ''}`}
                onClick={() => setFormat(fmt)}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>

          {isDualModel && (
            <>
              <span className="cf-quick-import-sep">·</span>
              <span className="cf-quick-import-label">Вставить в:</span>
              <div className="cf-quick-import-btn-group" role="group" aria-label="Целевая сторона">
                <button
                  type="button"
                  className={`cf-quick-import-tab ${target === 'server' ? 'is-active' : ''}`}
                  onClick={() => setTarget('server')}
                >
                  Сервер
                </button>
                <button
                  type="button"
                  className={`cf-quick-import-tab ${target === 'client' ? 'is-active' : ''}`}
                  onClick={() => setTarget('client')}
                >
                  Клиент
                </button>
              </div>
            </>
          )}
        </div>

        <div className="cf-quick-import-hints">
          <button
            type="button"
            className="cf-quick-import-sample-link"
            onClick={() => {
              setFormat('curl');
              handleTextChange('curl -X POST https://api.example.com/v1/payment \\\n  -H "Authorization: Bearer <token>" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "orderId": "ORD-12345",\n    "amount": 250000,\n    "currency": "UZS"\n  }\'');
            }}
          >
            Демо cURL
          </button>
          <button
            type="button"
            className="cf-quick-import-sample-link"
            onClick={() => {
              setFormat('json');
              handleTextChange('{\n  "accountId": "ACC-0987",\n  "status": "ACTIVE",\n  "balance": 1500000,\n  "isVerified": true\n}');
            }}
          >
            Демо JSON
          </button>
        </div>
      </div>

      <textarea
        className="cf-quick-import-textarea"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="Вставьте сюда JSON payload, cURL запрос, XML или JSON Schema..."
        rows={5}
        autoFocus
        aria-label="Текст для импорта параметров"
      />

      {(localError || error) && (
        <div className="cf-quick-import-error" role="alert">
          {localError || error}
        </div>
      )}

      <div className="cf-quick-import-footer">
        <WBButton size="sm" variant="ghost" onClick={onCancel}>
          Отмена
        </WBButton>
        <WBButton size="sm" variant="primary" onClick={handleApply} icon={<WorkbenchIcon name="check" />}>
          Распарсить в {isDualModel ? (target === 'server' ? 'Server' : 'Client') : 'таблицу'}
        </WBButton>
      </div>
    </div>
  );
}
