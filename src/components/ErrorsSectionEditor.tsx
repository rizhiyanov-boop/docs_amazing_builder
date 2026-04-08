import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { ERROR_CATALOG, ERROR_CATALOG_BY_CODE, POPULAR_HTTP_STATUS_CODES } from '../errorCatalog';
import type { DocSection, ErrorRow, ErrorsSection, ParsedRow, ParsedSection, ValidationRuleRow } from '../types';
import { buildValidationCause } from '../validationCause';

type InternalCodePopoverState = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

type ErrorsSectionEditorProps = {
  section: ErrorsSection;
  sections: DocSection[];
  validationCaseOptions: readonly string[];
  openInternalCodeKey: string | null;
  highlightedInternalCodeIndex: number;
  internalCodePopoverState: InternalCodePopoverState | null;
  internalCodeAnchorRefs: RefObject<Record<string, HTMLDivElement | null>>;
  internalCodePopoverRef: RefObject<HTMLDivElement | null>;
  setOpenInternalCodeKey: Dispatch<SetStateAction<string | null>>;
  setHighlightedInternalCodeIndex: Dispatch<SetStateAction<number>>;
  updateErrorRow: (sectionId: string, rowIndex: number, updater: (row: ErrorRow) => ErrorRow) => void;
  formatClientResponseCode: (sectionId: string, rowIndex: number) => void;
  applyInternalCode: (sectionId: string, rowIndex: number, nextCode: string) => void;
  formatErrorResponseCode: (sectionId: string, rowIndex: number) => void;
  deleteErrorRow: (sectionId: string, rowIndex: number) => void;
  addErrorRow: (sectionId: string) => void;
  updateValidationRuleRow: (sectionId: string, rowIndex: number, updater: (row: ValidationRuleRow) => ValidationRuleRow) => void;
  deleteValidationRuleRow: (sectionId: string, rowIndex: number) => void;
  addValidationRuleRow: (sectionId: string) => void;
  autofillValidationRulesFromRequestSchema: (sectionId: string) => void;
  getSectionRows: (section: ParsedSection) => ParsedRow[];
  getDynamicTextareaRows: (value: string, minRows?: number, maxRows?: number) => number;
  validateJsonDraft: (value: string) => string;
  renderUiIcon: (name: string) => ReactNode;
};

export function ErrorsSectionEditor({
  section,
  sections,
  validationCaseOptions,
  openInternalCodeKey,
  highlightedInternalCodeIndex,
  internalCodePopoverState,
  internalCodeAnchorRefs,
  internalCodePopoverRef,
  setOpenInternalCodeKey,
  setHighlightedInternalCodeIndex,
  updateErrorRow,
  formatClientResponseCode,
  applyInternalCode,
  formatErrorResponseCode,
  deleteErrorRow,
  addErrorRow,
  updateValidationRuleRow,
  deleteValidationRuleRow,
  addValidationRuleRow,
  autofillValidationRulesFromRequestSchema,
  getSectionRows,
  getDynamicTextareaRows,
  validateJsonDraft,
  renderUiIcon
}: ErrorsSectionEditorProps): ReactNode {
  const serverRequestRows = sections
    .filter((item): item is ParsedSection => item.kind === 'parsed' && item.sectionType === 'request')
    .flatMap((item) => getSectionRows(item));

  const serverRequestFieldTypeMap = new Map(
    serverRequestRows
      .map((row) => [row.field.trim().toLowerCase(), row.type] as const)
      .filter(([field]) => Boolean(field))
  );

  function updateValidationRuleWithAutocause(
    rowIndex: number,
    patch: Partial<Pick<ValidationRuleRow, 'parameter' | 'validationCase' | 'condition'>>
  ): void {
    updateValidationRuleRow(section.id, rowIndex, (current) => {
      const next = { ...current, ...patch };
      const parameterType = serverRequestFieldTypeMap.get(next.parameter.trim().toLowerCase());
      const nextCause = buildValidationCause({
        parameter: next.parameter,
        validationCase: next.validationCase,
        condition: next.condition,
        parameterType
      });

      return {
        ...next,
        cause: nextCause
      };
    });
  }

  const serverRequestParameterOptions = Array.from(
    new Set(
      serverRequestRows
        .map((row) => row.field.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

  return (
    <div className="stack">
      <datalist id="http-status-options">
        {POPULAR_HTTP_STATUS_CODES.map((code) => (
          <option key={code} value={code} />
        ))}
        <option value="-" />
      </datalist>

      <datalist id="server-request-param-options">
        {serverRequestParameterOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Client HTTP Status</th>
              <th>Client Response</th>
              <th>Trigger (условия возникновения)</th>
              <th>Error Type</th>
              <th>Server HTTP Status</th>
              <th>Полный internalCode</th>
              <th>Server Response</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row, index) => {
              const clientResponseError = validateJsonDraft(row.clientResponseCode ?? '');
              const normalizedCode = row.internalCode.trim();
              const hasUnknownInternalCode = Boolean(normalizedCode) && !ERROR_CATALOG_BY_CODE.has(normalizedCode);
              const internalCodeKey = `${section.id}-error-${index}`;
              const isInternalCodeOpen = openInternalCodeKey === internalCodeKey;
              const searchValue = normalizedCode.toLowerCase();
              const internalCodeOptions = ERROR_CATALOG
                .filter((item) => {
                  if (!searchValue) return true;
                  return (
                    item.internalCode.toLowerCase().includes(searchValue)
                    || item.httpStatus.toLowerCase().includes(searchValue)
                    || item.message.toLowerCase().includes(searchValue)
                  );
                })
                .slice(0, 25);

              return (
                <tr key={`${section.id}-error-${index}`}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      list="http-status-options"
                      value={row.clientHttpStatus}
                      onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, clientHttpStatus: e.target.value }))}
                    />
                  </td>
                  <td>
                    <div className="error-response-cell">
                      <input
                        type="text"
                        value={row.clientResponse}
                        onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, clientResponse: e.target.value }))}
                        placeholder="Описание client response"
                      />
                      <textarea
                        className={clientResponseError ? 'input-warning' : ''}
                        rows={getDynamicTextareaRows(row.clientResponseCode ?? '', 3, 10)}
                        value={row.clientResponseCode ?? ''}
                        onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, clientResponseCode: e.target.value }))}
                        placeholder="Код client response для WIKI (JSON)"
                      />
                      <button className="ghost small" type="button" onClick={() => formatClientResponseCode(section.id, index)}>
                        Форматировать JSON
                      </button>
                      {clientResponseError && <div className="inline-error">{clientResponseError}</div>}
                    </div>
                  </td>
                  <td>
                    <textarea
                      rows={getDynamicTextareaRows(row.trigger, 2, 8)}
                      value={row.trigger}
                      onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, trigger: e.target.value }))}
                    />
                  </td>
                  <td>
                    <select
                      value={row.errorType}
                      onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, errorType: e.target.value as ErrorRow['errorType'] }))}
                    >
                      <option value="-">-</option>
                      <option value="CommonException">CommonException</option>
                      <option value="BusinessException">BusinessException</option>
                      <option value="AlertException">AlertException</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      disabled
                      value={row.serverHttpStatus}
                      title="Поле заполняется автоматически по internalCode"
                    />
                  </td>
                  <td>
                    <div
                      className="internal-code-combobox"
                      ref={(node) => {
                        if (!internalCodeAnchorRefs.current) return;
                        internalCodeAnchorRefs.current[internalCodeKey] = node;
                      }}
                    >
                      <div className="internal-code-cell">
                        <input
                          className={hasUnknownInternalCode ? 'input-warning' : ''}
                          type="text"
                          value={row.internalCode}
                          onFocus={() => {
                            setOpenInternalCodeKey(internalCodeKey);
                            setHighlightedInternalCodeIndex(0);
                          }}
                          onChange={(e) => {
                            applyInternalCode(section.id, index, e.target.value);
                            setOpenInternalCodeKey(internalCodeKey);
                            setHighlightedInternalCodeIndex(0);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setOpenInternalCodeKey(null);
                              return;
                            }

                            if (event.key === 'ArrowDown') {
                              event.preventDefault();
                              if (!isInternalCodeOpen) {
                                setOpenInternalCodeKey(internalCodeKey);
                                setHighlightedInternalCodeIndex(0);
                                return;
                              }

                              setHighlightedInternalCodeIndex((current) =>
                                Math.min(current + 1, Math.max(internalCodeOptions.length - 1, 0))
                              );
                              return;
                            }

                            if (event.key === 'ArrowUp') {
                              event.preventDefault();
                              if (!isInternalCodeOpen) {
                                setOpenInternalCodeKey(internalCodeKey);
                                setHighlightedInternalCodeIndex(0);
                                return;
                              }

                              setHighlightedInternalCodeIndex((current) => Math.max(current - 1, 0));
                              return;
                            }

                            if (event.key === 'Enter' && isInternalCodeOpen && internalCodeOptions.length > 0) {
                              event.preventDefault();
                              const picked = internalCodeOptions[Math.min(highlightedInternalCodeIndex, internalCodeOptions.length - 1)];
                              if (picked) {
                                applyInternalCode(section.id, index, picked.internalCode);
                                setOpenInternalCodeKey(null);
                              }
                            }
                          }}
                          title={hasUnknownInternalCode ? 'Код не найден в каталоге, заполните поля вручную или уточните internalCode' : ''}
                          placeholder="Введите internalCode"
                          aria-label="internalCode"
                          aria-expanded={isInternalCodeOpen}
                          aria-controls={`${internalCodeKey}-options`}
                          aria-autocomplete="list"
                        />
                        <button
                          className="internal-code-toggle"
                          type="button"
                          aria-label="Показать варианты internalCode"
                          onClick={() => {
                            setOpenInternalCodeKey((current) => (current === internalCodeKey ? null : internalCodeKey));
                            setHighlightedInternalCodeIndex(0);
                          }}
                        >
                          ▾
                        </button>
                      </div>
                      {isInternalCodeOpen && internalCodePopoverState && createPortal(
                        <div
                          id={`${internalCodeKey}-options`}
                          ref={internalCodePopoverRef}
                          className={`internal-code-dropdown internal-code-dropdown-portal ${internalCodePopoverState.openUp ? 'is-top' : ''}`}
                          role="listbox"
                          style={{
                            top: `${internalCodePopoverState.top}px`,
                            left: `${internalCodePopoverState.left}px`,
                            width: `${internalCodePopoverState.width}px`,
                            maxHeight: `${internalCodePopoverState.maxHeight}px`
                          }}
                        >
                          {internalCodeOptions.length === 0 && (
                            <div className="internal-code-empty">Ничего не найдено</div>
                          )}
                          {internalCodeOptions.map((item, optionIndex) => (
                            <button
                              key={item.internalCode}
                              type="button"
                              className={`internal-code-option ${optionIndex === Math.min(highlightedInternalCodeIndex, Math.max(internalCodeOptions.length - 1, 0)) ? 'active' : ''}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onMouseEnter={() => setHighlightedInternalCodeIndex(optionIndex)}
                              onClick={() => {
                                applyInternalCode(section.id, index, item.internalCode);
                                setOpenInternalCodeKey(null);
                              }}
                            >
                              <span className="internal-code-option-code">{item.internalCode}</span>
                              <span className="internal-code-option-meta">{`${item.httpStatus} - ${item.message}`}</span>
                            </button>
                          ))}
                        </div>,
                        document.body
                      )}
                    </div>
                    {hasUnknownInternalCode && <div className="inline-warning">Код не найден в каталоге</div>}
                  </td>
                  <td>
                    <div className="error-response-cell">
                      <textarea
                        rows={getDynamicTextareaRows(row.responseCode, 3, 10)}
                        value={row.responseCode}
                        onChange={(e) => updateErrorRow(section.id, index, (current) => ({ ...current, responseCode: e.target.value }))}
                        placeholder="Server response JSON"
                      />
                      <button className="ghost small table-action-icon" type="button" onClick={() => formatErrorResponseCode(section.id, index)} aria-label="Форматировать JSON" title="Форматировать JSON">
                        <span className="ui-icon" aria-hidden>{renderUiIcon('format_json')}</span>
                      </button>
                    </div>
                  </td>
                  <td>
                    <button className="icon-button danger" type="button" onClick={() => deleteErrorRow(section.id, index)} aria-label="Удалить строку">
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="table-actions">
          <button className="ghost small table-action-icon" type="button" onClick={() => addErrorRow(section.id)} aria-label="Добавить строку ошибки" title="Добавить строку ошибки">
            <span className="ui-icon" aria-hidden>{renderUiIcon('add_row')}</span>
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Параметр (server request)</th>
              <th>Кейс валидации</th>
              <th>Условие возникновения</th>
              <th>cause</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {section.validationRules.map((rule, index) => (
              <tr key={`${section.id}-validation-${index}`}>
                <td>{index + 1}</td>
                <td>
                  <input
                    type="text"
                    list="server-request-param-options"
                    value={rule.parameter}
                    onChange={(e) => updateValidationRuleWithAutocause(index, { parameter: e.target.value })}
                    placeholder="Выберите из server request или введите вручную"
                  />
                </td>
                <td>
                  <select
                    value={rule.validationCase}
                    onChange={(e) => updateValidationRuleWithAutocause(index, { validationCase: e.target.value })}
                  >
                    {validationCaseOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <textarea
                    rows={getDynamicTextareaRows(rule.condition, 1, 6)}
                    value={rule.condition}
                    onChange={(e) => updateValidationRuleWithAutocause(index, { condition: e.target.value })}
                  />
                </td>
                <td>
                  <textarea
                    rows={getDynamicTextareaRows(rule.cause, 1, 6)}
                    value={rule.cause}
                    onChange={(e) => updateValidationRuleRow(section.id, index, (current) => ({ ...current, cause: e.target.value }))}
                  />
                </td>
                <td>
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => deleteValidationRuleRow(section.id, index)}
                    aria-label="Удалить правило валидации"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-actions">
          <button
            className="ghost small"
            type="button"
            onClick={() => autofillValidationRulesFromRequestSchema(section.id)}
            title="Заполнить таблицу по Server Request JSON Schema"
          >
            Заполнить из JSON Schema
          </button>
          <button className="ghost small table-action-icon" type="button" onClick={() => addValidationRuleRow(section.id)} aria-label="Добавить правило валидации" title="Добавить правило валидации">
            <span className="ui-icon" aria-hidden>{renderUiIcon('add_row')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
