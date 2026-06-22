import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import Highlight from '@tiptap/extension-highlight';
import StarterKit from '@tiptap/starter-kit';
import { editorHtmlToWikiText, richTextToHtml } from '../richText';

type InlineTextSectionEditorProps = {
  sectionId: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
};

const EMPTY_HTML = '<p></p>';

export const INLINE_TEXT_FORMAT_LABELS = [
  'Жирный (Ctrl+B)',
  'Курсив (Ctrl+I)',
  'Встроенный код',
  'Подзаголовок',
  'Цитата',
  'Маркированный список',
  'Нумерованный список'
] as const;

export function InlineTextSectionEditor({ sectionId, value, onChange, onFocus }: InlineTextSectionEditorProps) {
  const onChangeRef = useRef(onChange);
  const lastEmittedValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        codeBlock: false
      }),
      Highlight.configure({ multicolor: true })
    ],
    content: value.trim() ? richTextToHtml(value, { editable: true }) : EMPTY_HTML,
    editorProps: {
      attributes: {
        class: 'rich-text-editor inline-text-editor',
        role: 'textbox',
        'aria-label': 'Содержимое текстовой секции'
      }
    },
    onFocus,
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue = editorHtmlToWikiText(currentEditor.getHTML());
      lastEmittedValueRef.current = nextValue;
      onChangeRef.current(nextValue);
    }
  });

  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      isEmpty: currentEditor?.isEmpty ?? true,
      bold: currentEditor?.isActive('bold') ?? false,
      italic: currentEditor?.isActive('italic') ?? false,
      code: currentEditor?.isActive('code') ?? false,
      heading: currentEditor?.isActive('heading', { level: 3 }) ?? false,
      quote: currentEditor?.isActive('blockquote') ?? false,
      bulletList: currentEditor?.isActive('bulletList') ?? false,
      orderedList: currentEditor?.isActive('orderedList') ?? false
    })
  });

  useEffect(() => {
    if (!editor || value === lastEmittedValueRef.current) return;
    editor.commands.setContent(value.trim() ? richTextToHtml(value, { editable: true }) : EMPTY_HTML, { emitUpdate: false });
    lastEmittedValueRef.current = value;
  }, [editor, value]);

  if (!editor) return null;

  const runCommand = (command: () => boolean): void => {
    command();
    editor.commands.focus();
  };

  return (
    <div className="inline-text-editor-shell" data-section-id={sectionId}>
      <BubbleMenu
        editor={editor}
        pluginKey={`text-section-bubble-${sectionId}`}
        shouldShow={({ editor: currentEditor, from, to }) => currentEditor.isFocused && from !== to}
        appendTo={() => document.body}
        options={{
          strategy: 'fixed',
          placement: 'top',
          offset: 10,
          flip: true,
          shift: { padding: 10 },
          inline: true
        }}
        className="inline-format-bubble"
        role="toolbar"
        aria-label="Форматирование"
      >
        <button
          type="button"
          className={editorState?.bold ? 'active' : ''}
          aria-label={INLINE_TEXT_FORMAT_LABELS[0]}
          aria-pressed={editorState?.bold ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(() => editor.chain().focus().toggleBold().run())}
        >
          B
        </button>
        <button
          type="button"
          className={`toolbar-icon-italic ${editorState?.italic ? 'active' : ''}`}
          aria-label={INLINE_TEXT_FORMAT_LABELS[1]}
          aria-pressed={editorState?.italic ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(() => editor.chain().focus().toggleItalic().run())}
        >
          I
        </button>
        <button
          type="button"
          className={`mono ${editorState?.code ? 'active' : ''}`}
          aria-label={INLINE_TEXT_FORMAT_LABELS[2]}
          aria-pressed={editorState?.code ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(() => editor.chain().focus().toggleCode().run())}
        >
          {'</>'}
        </button>
        <span className="inline-format-separator" aria-hidden="true" />
        <button
          type="button"
          className={editorState?.heading ? 'active' : ''}
          aria-label={INLINE_TEXT_FORMAT_LABELS[3]}
          aria-pressed={editorState?.heading ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        >
          T³
        </button>
        <button
          type="button"
          className={editorState?.quote ? 'active' : ''}
          aria-label={INLINE_TEXT_FORMAT_LABELS[4]}
          aria-pressed={editorState?.quote ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(() => editor.chain().focus().toggleBlockquote().run())}
        >
          ❝
        </button>
        <span className="inline-format-separator" aria-hidden="true" />
        <button
          type="button"
          className={editorState?.bulletList ? 'active' : ''}
          aria-label={INLINE_TEXT_FORMAT_LABELS[5]}
          aria-pressed={editorState?.bulletList ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(() => editor.chain().focus().toggleBulletList().run())}
        >
          •
        </button>
        <button
          type="button"
          className={editorState?.orderedList ? 'active' : ''}
          aria-label={INLINE_TEXT_FORMAT_LABELS[6]}
          aria-pressed={editorState?.orderedList ?? false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(() => editor.chain().focus().toggleOrderedList().run())}
        >
          1.
        </button>
      </BubbleMenu>

      {editorState?.isEmpty && <span className="inline-text-placeholder">Введите содержимое…</span>}
      <EditorContent
        editor={editor}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;

          const from = editor.state.selection.$from;
          let insideListItem = false;
          for (let depth = from.depth; depth > 0; depth -= 1) {
            if (from.node(depth).type.name === 'listItem') {
              insideListItem = true;
              break;
            }
          }
          if (!insideListItem) return;

          event.preventDefault();
          if (event.shiftKey) {
            editor.chain().focus().liftListItem('listItem').run();
          } else {
            const sunk = editor.chain().focus().sinkListItem('listItem').run();
            if (!sunk) editor.chain().focus().splitListItem('listItem').sinkListItem('listItem').run();
          }
        }}
      />
    </div>
  );
}
