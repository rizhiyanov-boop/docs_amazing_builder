import type { ParsedSection } from '../types';

type ParseTarget = 'server' | 'client';
type ParseFormat = 'json' | 'curl';

type EditingSourceState = {
  sectionId: string;
  target: ParseTarget;
  draft: string;
};

type SourceEditorProps = {
  section: ParsedSection;
  target: ParseTarget;
  title?: string;
  editingSource: EditingSourceState | null;
  sourceEditorError: string;
  getSourceFormat: (section: ParsedSection, target: ParseTarget) => ParseFormat;
  getSourceValue: (section: ParsedSection, target: ParseTarget) => string;
  detectSourceFormat: (draft: string) => ParseFormat | null;
  validateSourceDraft: (format: ParseFormat, draft: string) => string;
  beautifySourceDraft: (format: ParseFormat, draft: string) => string;
  highlightCode: (format: ParseFormat, value: string) => string;
  setEditingSource: (value: EditingSourceState | null | ((current: EditingSourceState | null) => EditingSourceState | null)) => void;
  setSourceEditorError: (value: string) => void;
  updateParsedSection: (id: string, updater: (section: ParsedSection) => ParsedSection) => void;
  copyToClipboard: (value: string) => void | Promise<void>;
  openSourceTextImport: (section: ParsedSection, target: ParseTarget) => void;
  startSourceEditing: (section: ParsedSection, target: ParseTarget) => void;
  cancelSourceEditing: () => void;
  saveSourceEditing: () => void;
  beautifySourceEditing: () => void;
  runParser: (section: ParsedSection, target: ParseTarget) => void;
};

export function SourceEditor({
  section,
  target,
  title = 'Исходные данные',
  editingSource,
  sourceEditorError,
  getSourceFormat,
  getSourceValue,
  detectSourceFormat,
  validateSourceDraft,
  beautifySourceDraft,
  highlightCode,
  setEditingSource,
  setSourceEditorError,
  updateParsedSection,
  copyToClipboard,
  openSourceTextImport,
  startSourceEditing,
  cancelSourceEditing,
  saveSourceEditing,
  beautifySourceEditing,
  runParser
}: SourceEditorProps) {
  const format = getSourceFormat(section, target);
  const value = getSourceValue(section, target);
  const isEditing = editingSource?.sectionId === section.id && editingSource.target === target;
  const currentValue = isEditing ? editingSource.draft : value;
  const shouldOpenEmptyInput = !value.trim() && !isEditing;
  const hasSourceValue = Boolean(currentValue.trim());

  return (
    <div className="source-panel">
      <div className="source-panel-head">
        <div className="label">{title}</div>
        <div className="source-format-status">
          <span className={`source-format-badge ${hasSourceValue ? 'active' : ''}`}>{format.toUpperCase()}</span>
        </div>
        <div className="field-actions visible">
          {!isEditing && (
            <>
              <button className="icon-button" type="button" title="Копировать" aria-label="Копировать" onClick={() => void copyToClipboard(value)}>
                ⧉
              </button>
              {format === 'json' && (
                <button
                  className="icon-button"
                  type="button"
                  title="Beautify"
                  aria-label="Beautify"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    updateParsedSection(section.id, (current) => {
                      try {
                        const nextValue = beautifySourceDraft(format, value);
                        if (target === 'client' && (current.sectionType === 'request' || current.sectionType === 'response')) {
                          return { ...current, clientInput: nextValue, clientError: '' };
                        }
                        return { ...current, input: nextValue, error: '' };
                      } catch {
                        return current;
                      }
                    })
                  }
                >
                  ✨
                </button>
              )}
              <button className="icon-button" type="button" title="Импорт текста" aria-label="Импорт текста" onMouseDown={(event) => event.preventDefault()} onClick={() => openSourceTextImport(section, target)}>
                ⇣
              </button>
              <button className="icon-button" type="button" title="Редактировать" aria-label="Редактировать" onMouseDown={(event) => event.preventDefault()} onClick={() => startSourceEditing(section, target)}>
                ✎
              </button>
            </>
          )}
          {isEditing && (
            <>
              {format === 'json' && (
                <button className="icon-button" type="button" title="Beautify" aria-label="Beautify" onMouseDown={(event) => event.preventDefault()} onClick={beautifySourceEditing}>
                  ✨
                </button>
              )}
              <button className="icon-button" type="button" title="Сохранить" aria-label="Сохранить" onMouseDown={(event) => event.preventDefault()} onClick={saveSourceEditing}>
                ✓
              </button>
              <button className="icon-button danger" type="button" title="Отменить" aria-label="Отменить" onMouseDown={(event) => event.preventDefault()} onClick={cancelSourceEditing}>
                ✕
              </button>
            </>
          )}
        </div>
      </div>

      <div className="source-input-area">
        {shouldOpenEmptyInput && (
          <div className="source-edit-wrap">
            <textarea
              data-testid={`source-textarea-${section.id}-${target}`}
              className="source-edit"
              rows={12}
              value=""
              onChange={(e) => {
                const nextDraft = e.target.value;
                const nextFormat = detectSourceFormat(nextDraft) ?? format;
                setEditingSource({
                  sectionId: section.id,
                  target,
                  draft: nextDraft
                });
                setSourceEditorError(validateSourceDraft(nextFormat, nextDraft));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelSourceEditing();
              }}
              placeholder="Вставьте JSON или cURL"
              autoFocus
            />
          </div>
        )}

        {!isEditing && !shouldOpenEmptyInput && (
          <div className={`source-code source-code-display language-${format}`} onDoubleClick={() => startSourceEditing(section, target)}>
            <pre className={`source-code language-${format}`}>
              <code dangerouslySetInnerHTML={{ __html: highlightCode(format, currentValue || '') || '&nbsp;' }} />
            </pre>
          </div>
        )}

        {isEditing && (
          <div className="source-edit-wrap">
            <textarea
              data-testid={`source-textarea-${section.id}-${target}`}
              className="source-edit"
              rows={12}
              value={editingSource.draft}
              onChange={(e) => {
                const nextDraft = e.target.value;
                const nextFormat = detectSourceFormat(nextDraft) ?? format;
                setEditingSource((current) => (current ? { ...current, draft: nextDraft } : current));
                setSourceEditorError(validateSourceDraft(nextFormat, nextDraft));
              }}
              onBlur={() => {
                if (format !== 'json') saveSourceEditing();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelSourceEditing();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveSourceEditing();
              }}
              placeholder="Вставьте JSON или cURL"
              autoFocus
            />
            {sourceEditorError && <div className="inline-error">{sourceEditorError}</div>}
          </div>
        )}

        <button
          className="source-parse-fab"
          type="button"
          data-testid={`parse-button-${section.id}-${target}`}
          data-onboarding-anchor={target === 'server' ? 'run-parse' : undefined}
          onClick={() => runParser(section, target)}
          disabled={!currentValue.trim()}
          title="Запустить парсер"
        >
          Парсить
        </button>
      </div>
    </div>
  );
}
