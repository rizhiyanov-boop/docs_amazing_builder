import type { ReactNode } from 'react';
import { getParsedRowKey, isAuthHeader, isDefaultRequestHeader } from '../requestHeaders';
import type { ParsedRow, ParsedSection } from '../types';

type ParseTarget = 'server' | 'client';

type RequestHeadersTableProps = {
  section: ParsedSection;
  target: ParseTarget;
  getExternalRequestHeaderRowsForEditor: (section: ParsedSection) => ParsedRow[];
  getRequestHeaderRowsForEditor: (section: ParsedSection) => ParsedRow[];
  renderEditableFieldCell: (
    section: ParsedSection,
    row: ParsedRow,
    options?: {
      allowEdit?: boolean;
      onDelete?: () => void;
    }
  ) => ReactNode;
  updateParsedSection: (id: string, updater: (section: ParsedSection) => ParsedSection) => void;
  updateServerRow: (sectionId: string, rowKey: string, updater: (row: ParsedRow) => ParsedRow) => void;
  addRequestHeader: (section: ParsedSection) => void;
  addExternalRequestHeader: (section: ParsedSection) => void;
  deleteRequestHeader: (sectionId: string, rowKey: string) => void;
  deleteExternalRequestHeader: (sectionId: string, rowKey: string) => void;
};

export function RequestHeadersTable({
  section,
  target,
  getExternalRequestHeaderRowsForEditor,
  getRequestHeaderRowsForEditor,
  renderEditableFieldCell,
  updateParsedSection,
  updateServerRow,
  addRequestHeader,
  addExternalRequestHeader,
  deleteRequestHeader,
  deleteExternalRequestHeader
}: RequestHeadersTableProps) {
  const isExternal = target === 'client';
  const headers = isExternal ? getExternalRequestHeaderRowsForEditor(section) : getRequestHeaderRowsForEditor(section);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Вкл.</th>
            <th>Header</th>
            <th>Обязательность</th>
            <th>Описание</th>
            <th>Пример</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((row, index) => {
            const rowKey = getParsedRowKey(row);
            const isDefault = isExternal ? false : isDefaultRequestHeader(row);
            const isAuto = isExternal ? false : isAuthHeader(section, row);
            const persistedRows = isExternal ? section.clientRows ?? [] : section.rows;
            const persistedRow = persistedRows.find((item) => getParsedRowKey(item) === rowKey);
            const isPersisted = Boolean(persistedRow);

            return (
              <tr key={`${rowKey}-${index}`}>
                <td>
                  {isAuto ? (
                    <span className="chip">auto</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={row.enabled !== false}
                      onChange={(e) => {
                        if (isPersisted) {
                          if (isExternal) {
                            updateParsedSection(section.id, (current) => ({
                              ...current,
                              clientRows: (current.clientRows ?? []).map((item) =>
                                getParsedRowKey(item) === rowKey ? { ...item, enabled: e.target.checked } : item
                              )
                            }));
                          } else {
                            updateServerRow(section.id, rowKey, (current) => ({ ...current, enabled: e.target.checked }));
                          }
                          return;
                        }

                        updateParsedSection(section.id, (current) => ({
                          ...current,
                          [isExternal ? 'clientRows' : 'rows']: [
                            ...(isExternal ? current.clientRows ?? [] : current.rows),
                            {
                              ...row,
                              enabled: e.target.checked
                            }
                          ]
                        }));
                      }}
                    />
                  )}
                </td>
                <td>
                  {renderEditableFieldCell(
                    section,
                    row,
                    isAuto || isDefault
                      ? { allowEdit: false }
                      : {
                          onDelete: () => (isExternal ? deleteExternalRequestHeader(section.id, rowKey) : deleteRequestHeader(section.id, rowKey))
                        }
                  )}
                </td>
                <td>{row.required || '—'}</td>
                <td>
                  {isAuto || isDefault ? (
                    row.description || '—'
                  ) : (
                    <input
                      type="text"
                      value={isPersisted ? persistedRow?.description ?? row.description : row.description}
                      onChange={(e) =>
                        isExternal
                          ? updateParsedSection(section.id, (current) => ({
                              ...current,
                              clientRows: (current.clientRows ?? []).map((item) =>
                                getParsedRowKey(item) === rowKey ? { ...item, description: e.target.value } : item
                              )
                            }))
                          : updateServerRow(section.id, rowKey, (current) => ({ ...current, description: e.target.value }))
                      }
                    />
                  )}
                </td>
                <td className="mono">
                  {isAuto || isDefault ? (
                    row.example || '—'
                  ) : (
                    <input
                      type="text"
                      value={isPersisted ? persistedRow?.example ?? row.example : row.example}
                      onChange={(e) =>
                        isExternal
                          ? updateParsedSection(section.id, (current) => ({
                              ...current,
                              clientRows: (current.clientRows ?? []).map((item) =>
                                getParsedRowKey(item) === rowKey ? { ...item, example: e.target.value } : item
                              )
                            }))
                          : updateServerRow(section.id, rowKey, (current) => ({ ...current, example: e.target.value }))
                      }
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="table-actions">
        <button className="ghost small" type="button" onClick={() => (isExternal ? addExternalRequestHeader(section) : addRequestHeader(section))}>
          + Header
        </button>
      </div>
    </div>
  );
}
