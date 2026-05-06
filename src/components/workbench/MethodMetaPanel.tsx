import { useMemo, useState, type ReactNode } from 'react';
import type { MethodDocument, MethodStatus, RequestMethod } from '../../types';

type MethodMetaPanelProps = {
  method: MethodDocument;
  methodHttpMethod: RequestMethod;
  methodPath: string;
  onUpdate: (patch: Partial<MethodDocument>) => void;
};

type MetaFieldProps = {
  label: string;
  value: string | undefined;
  placeholder?: string;
  href?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
};

const STATUS_OPTIONS: Array<{ value: MethodStatus; label: string; color: string }> = [
  { value: 'draft', label: 'Черновик', color: 'var(--wb-text-muted)' },
  { value: 'review', label: 'На ревью', color: 'var(--wb-put-fg)' },
  { value: 'done', label: 'Готово', color: 'var(--wb-get-fg)' }
];

function formatUpdatedAt(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '—';
  return new Date(time).toLocaleString('ru-RU');
}

function MetaField({ label, value, placeholder = '—', href, multiline = false, onChange }: MetaFieldProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const safeValue = value ?? '';

  if (editing) {
    const commonStyle = {
      width: '100%',
      background: 'var(--wb-bg-soft)',
      border: '1px solid var(--wb-accent)',
      borderRadius: 'var(--wb-radius)',
      padding: '6px 8px',
      fontSize: 13,
      color: 'var(--wb-text)',
      fontFamily: 'var(--wb-font-sans)'
    } as const;

    if (multiline) {
      return (
        <label className="wb-meta-row">
          <span className="wb-meta-label">{label}</span>
          <textarea
            autoFocus
            value={draft}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              onChange(draft.trim());
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                onChange(draft.trim());
                setEditing(false);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft(safeValue);
                setEditing(false);
              }
            }}
            style={{ ...commonStyle, resize: 'vertical', minHeight: 66 }}
          />
        </label>
      );
    }

    return (
      <label className="wb-meta-row">
        <span className="wb-meta-label">{label}</span>
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            onChange(draft.trim());
            setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onChange(draft.trim());
              setEditing(false);
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(safeValue);
              setEditing(false);
            }
          }}
          style={commonStyle}
        />
      </label>
    );
  }

  return (
    <div className="wb-meta-row">
      <span className="wb-meta-label">{label}</span>
      <div className="wb-meta-value" onClick={() => {
        setDraft(safeValue);
        setEditing(true);
      }}>
        {safeValue && href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="wb-meta-link">
            {safeValue} ↗
          </a>
        ) : (
          <span className={safeValue ? 'wb-meta-text' : 'wb-meta-placeholder'}>{safeValue || placeholder}</span>
        )}
      </div>
    </div>
  );
}

export function MethodMetaPanel({ method, methodHttpMethod, methodPath, onUpdate }: MethodMetaPanelProps): ReactNode {
  const [statusOpen, setStatusOpen] = useState(false);
  const status = method.status ?? 'draft';
  const statusOption = STATUS_OPTIONS.find((item) => item.value === status) ?? STATUS_OPTIONS[0];
  const jiraHref = method.jiraTicket?.startsWith('http') ? method.jiraTicket : undefined;
  const externalHref = method.externalUrl?.startsWith('http') ? method.externalUrl : undefined;
  const methodLine = useMemo(() => `${methodHttpMethod} ${methodPath || '/'}`, [methodHttpMethod, methodPath]);

  return (
    <aside className="wb-meta-panel">
      <div className="wb-meta-header">
        <div className="wb-meta-method">{methodHttpMethod}</div>
        <div className="wb-meta-path" title={methodLine}>{methodPath || '/'}</div>
      </div>

      <div className="wb-meta-row">
        <span className="wb-meta-label">Статус</span>
        <div className="wb-meta-status-wrap">
          <button type="button" className="wb-meta-status-btn" onClick={() => setStatusOpen((current) => !current)}>
            <span className="wb-meta-dot" style={{ background: statusOption.color }} />
            <span>{statusOption.label}</span>
            <span className="wb-meta-caret">▾</span>
          </button>
          {statusOpen && (
            <div className="wb-meta-status-menu">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="wb-meta-status-option"
                  onClick={() => {
                    onUpdate({ status: option.value });
                    setStatusOpen(false);
                  }}
                >
                  <span className="wb-meta-dot" style={{ background: option.color }} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <MetaField label="Jira" value={method.jiraTicket} href={jiraHref} onChange={(value) => onUpdate({ jiraTicket: value || undefined })} />
      <MetaField label="Epic" value={method.epic} onChange={(value) => onUpdate({ epic: value || undefined })} />
      <MetaField label="Инициаторы" value={method.initiators} onChange={(value) => onUpdate({ initiators: value || undefined })} />
      <MetaField label="Ответственный" value={method.responsible} multiline onChange={(value) => onUpdate({ responsible: value || undefined })} />
      <MetaField label="Внешний URL" value={method.externalUrl} href={externalHref} onChange={(value) => onUpdate({ externalUrl: value || undefined })} />

      <div className="wb-meta-row">
        <span className="wb-meta-label">Обновлено</span>
        <span className="wb-meta-text">{formatUpdatedAt(method.updatedAt)}</span>
      </div>
    </aside>
  );
}
