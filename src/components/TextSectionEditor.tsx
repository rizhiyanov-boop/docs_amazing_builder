import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { renderEditableCodeBlockHtml } from '../richText';
import type { TextSection } from '../types';

type RichTextAction = 'bold' | 'italic' | 'code' | 'h3' | 'ul' | 'ol' | 'quote' | 'highlight' | 'code-block';
type RichTextCommandOptions = {
  color?: string;
  language?: string;
};

type TextSectionEditorProps = {
  section: TextSection;
  textSectionRef: RefObject<HTMLDivElement | null>;
  selectedHighlightColor: string;
  setSelectedHighlightColor: (value: string) => void;
  rememberTextSelection: () => void;
  restoreTextSelection: () => void;
  syncTextSectionFromEditor: (sectionId: string) => void;
  applyTextEditorCommand: (sectionId: string, action: RichTextAction, options?: RichTextCommandOptions) => void;
  pickHighlightColor: (current: string) => string | null;
};

export function TextSectionEditor({
  section,
  textSectionRef,
  selectedHighlightColor,
  setSelectedHighlightColor,
  rememberTextSelection,
  restoreTextSelection,
  syncTextSectionFromEditor,
  applyTextEditorCommand,
  pickHighlightColor
}: TextSectionEditorProps) {
  const syncEditorState = () => {
    rememberTextSelection();
    syncTextSectionFromEditor(section.id);
  };

  const placeCaretInsideCodeBlock = (codeElement: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(codeElement);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const maybeConvertFenceToCodeBlock = (): boolean => {
    const editor = textSectionRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return false;

    const anchorNode = selection.anchorNode;
    const anchorElement =
      anchorNode instanceof HTMLElement
        ? anchorNode
        : anchorNode instanceof Text
          ? anchorNode.parentElement
          : null;

    let block = anchorElement?.closest('p, div, li') ?? null;
    if (block === editor) block = null;

    const rawText = block?.textContent?.replace(/\u00a0/g, ' ') ?? editor.textContent?.replace(/\u00a0/g, ' ') ?? '';
    const match = rawText.trim().match(/^```([a-z0-9+#-]+)?$/i);
    if (!match) return false;

    const normalizedLanguage = (match[1] ?? 'auto').toLowerCase();
    const nextMarkup = `${renderEditableCodeBlockHtml('', normalizedLanguage)}<p><br></p>`;

    if (block && editor.contains(block)) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = nextMarkup;
      block.replaceWith(...Array.from(wrapper.childNodes));
    } else {
      editor.innerHTML = nextMarkup;
    }

    const codeElement = editor.querySelector<HTMLElement>('pre[data-rich-code-block="1"] code');
    if (codeElement) placeCaretInsideCodeBlock(codeElement);

    return true;
  };

  const handleEditorInput = () => {
    const converted = maybeConvertFenceToCodeBlock();
    syncEditorState();
    if (converted) rememberTextSelection();
  };

  const handleEditorChange = (event: ChangeEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.dataset.codeLanguageSelect !== '1') return;

    const codeBlock = target.closest<HTMLElement>('pre[data-rich-code-block="1"]');
    if (!codeBlock) return;

    codeBlock.dataset.codeLanguage = target.value;
    syncEditorState();
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const listItem = anchorElement?.closest('li');

    if (!listItem || !textSectionRef.current?.contains(listItem)) return;

    event.preventDefault();
    rememberTextSelection();
    restoreTextSelection();
    document.execCommand(event.shiftKey ? 'outdent' : 'indent');
    syncEditorState();
  };

  return (
    <div className="stack">
      <div className="editor-toolbar-shell" data-onboarding-anchor="refine-structure">
        <div className="editor-toolbar-head">
          <div className="editor-toolbar-title">Редактор текста</div>
          <div className="editor-toolbar-note">Выделите текст и примените форматирование</div>
        </div>
        <div className="text-toolbar" role="toolbar" aria-label="Форматирование текста">
          <div className="toolbar-group" aria-label="Базовое форматирование">
            <button
              className="ghost small toolbar-button"
              type="button"
              title="Жирный"
              aria-label="Жирный"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => applyTextEditorCommand(section.id, 'bold')}
            >
              <span className="toolbar-icon toolbar-icon-bold">B</span>
            </button>
            <button
              className="ghost small toolbar-button"
              type="button"
              title="Курсив"
              aria-label="Курсив"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => applyTextEditorCommand(section.id, 'italic')}
            >
              <span className="toolbar-icon toolbar-icon-italic">I</span>
            </button>
            <button
              className="ghost small toolbar-button"
              type="button"
              title="Код"
              aria-label="Код"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => applyTextEditorCommand(section.id, 'code')}
            >
              <span className="toolbar-icon">&lt;/&gt;</span>
            </button>
            <button
              className="ghost small toolbar-button"
              type="button"
              title="Выделение цветом"
              aria-label="Выделение цветом"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => {
                const nextColor = pickHighlightColor(selectedHighlightColor);
                if (!nextColor) return;
                setSelectedHighlightColor(nextColor);
                applyTextEditorCommand(section.id, 'highlight', {
                  color: nextColor
                });
              }}
            >
              <span className="toolbar-icon">H</span>
            </button>
          </div>
          <div className="toolbar-group" aria-label="Структура текста">
            <button
              className="ghost small toolbar-button"
              type="button"
              title="Подзаголовок"
              aria-label="Подзаголовок"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => applyTextEditorCommand(section.id, 'h3')}
            >
              <span className="toolbar-heading-glyph" aria-hidden="true">
                <span className="toolbar-heading-main">T</span>
                <span className="toolbar-heading-level">3</span>
              </span>
            </button>
            <button
              className="ghost small toolbar-button"
              type="button"
              title="Цитата"
              aria-label="Цитата"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => applyTextEditorCommand(section.id, 'quote')}
            >
              <span className="toolbar-icon">"</span>
            </button>
          </div>
          <div className="toolbar-group" aria-label="Списки">
            <button
              className="ghost small toolbar-button"
              type="button"
              title="Маркированный список"
              aria-label="Маркированный список"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => applyTextEditorCommand(section.id, 'ul')}
            >
              <span className="toolbar-icon">•</span>
            </button>
            <button
              className="ghost small toolbar-button"
              type="button"
              title="Нумерованный список"
              aria-label="Нумерованный список"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => applyTextEditorCommand(section.id, 'ol')}
            >
              <span className="toolbar-icon">1.</span>
            </button>
          </div>
          <div className="toolbar-group toolbar-group-controls" aria-label="Кодовые блоки">
            <button
              className="ghost small toolbar-button toolbar-button-wide"
              type="button"
              title="Вставить блок кода"
              aria-label="Вставить блок кода"
              onMouseDown={(event) => {
                event.preventDefault();
                rememberTextSelection();
              }}
              onClick={() => applyTextEditorCommand(section.id, 'code-block', { language: 'auto' })}
            >
              <span className="toolbar-icon">{`{ }`}</span>
            </button>
          </div>
        </div>
      </div>
      <div className="panel-sub">Поддерживаются подзаголовки, цитаты, код и вложенные списки с Tab.</div>
      <label className="field">
        <div className="label">Содержимое</div>
        <div
          ref={textSectionRef}
          data-testid={`text-editor-${section.id}`}
          className="rich-text-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={handleEditorInput}
          onChange={handleEditorChange}
          onMouseUp={rememberTextSelection}
          onKeyUp={rememberTextSelection}
          onKeyDown={handleEditorKeyDown}
        />
      </label>
    </div>
  );
}
