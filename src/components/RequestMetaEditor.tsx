import { buildInputFromRows } from '../sourceSync';
import type { ParsedRow, ParsedSection, RequestMethod } from '../types';

type ParseTarget = 'server' | 'client';

type RequestMetaEditorProps = {
  section: ParsedSection;
  target: ParseTarget;
  isExpanderOpen: (sectionId: string, blockId: string) => boolean;
  setExpanderOpen: (sectionId: string, blockId: string, isOpen: boolean) => void;
  getExternalSourceRows: (section: ParsedSection) => ParsedRow[];
  getRequestHeaderRowsForEditor: (section: ParsedSection) => ParsedRow[];
  updateParsedSection: (id: string, updater: (section: ParsedSection) => ParsedSection) => void;
};

export function RequestMetaEditor({
  section,
  target,
  isExpanderOpen,
  setExpanderOpen,
  getExternalSourceRows,
  getRequestHeaderRowsForEditor,
  updateParsedSection
}: RequestMetaEditorProps) {
  if (section.sectionType !== 'request') return null;

  const isExternal = target === 'client';
  const title = isExternal ? 'Внешний вызов' : 'Общее описание метода';
  const urlLabel = isExternal ? 'Внешний URL' : 'URL метода';
  const blockId = isExternal ? 'meta-client' : 'meta-server';

  const applyRequestMeta = (
    patch: Partial<Pick<ParsedSection, 'requestUrl' | 'requestMethod' | 'externalRequestUrl' | 'externalRequestMethod'>>
  ) => {
    updateParsedSection(section.id, (current) => {
      const next = { ...current, ...patch };
      const targetFormat = isExternal ? next.clientFormat ?? 'json' : next.format;
      if (targetFormat !== 'curl') return next;

      const syncRows = isExternal
        ? next.clientRows ?? []
        : [...getRequestHeaderRowsForEditor(next).filter((row) => row.enabled !== false), ...next.rows.filter((row) => row.source !== 'header')];

      return {
        ...next,
        ...(isExternal
          ? {
              clientInput: buildInputFromRows(targetFormat, getExternalSourceRows(next), {
                requestUrl: next.externalRequestUrl,
                requestMethod: next.externalRequestMethod
              }),
              clientLastSyncedFormat: targetFormat
            }
          : {
              input: buildInputFromRows(targetFormat, syncRows, {
                requestUrl: next.requestUrl,
                requestMethod: next.requestMethod
              }),
              lastSyncedFormat: targetFormat
            })
      };
    });
  };

  return (
    <details
      className="expander"
      open={isExpanderOpen(section.id, blockId)}
      onToggle={(e) => setExpanderOpen(section.id, blockId, e.currentTarget.open)}
    >
      <summary className="expander-summary">{title}</summary>
      <div className="expander-body">
        <div className="row gap auth-grid">
          <label className="field">
            <div className="label">{urlLabel}</div>
            <input
              type="text"
              value={isExternal ? section.externalRequestUrl ?? '' : section.requestUrl ?? ''}
              onChange={(e) => applyRequestMeta(isExternal ? { externalRequestUrl: e.target.value } : { requestUrl: e.target.value })}
              placeholder="https://api.example.com/v1/method"
            />
          </label>
          <label className="field">
            <div className="label">Тип метода</div>
            <select
              value={isExternal ? section.externalRequestMethod ?? 'POST' : section.requestMethod ?? 'POST'}
              onChange={(e) =>
                applyRequestMeta(
                  isExternal
                    ? { externalRequestMethod: e.target.value as RequestMethod }
                    : { requestMethod: e.target.value as RequestMethod }
                )
              }
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
          <label className="field">
            <div className="label">Протокол</div>
            <input type="text" value="REST" readOnly />
          </label>
        </div>
        <div className="muted">Для MVP протокол фиксирован как REST. URL и HTTP-метод автоматически используются при генерации cURL.</div>
      </div>
    </details>
  );
}
