import { useEffect, useRef, useState } from 'react';
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type NodeViewProps } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { editorHtmlToWikiText, richTextToHtml } from '../richText';
import './InlineTextSectionEditor.css';

const items = [
  { label: 'Текст', hint: 'Обычный абзац', type: 'paragraph' },
  { label: 'Подзаголовок', hint: 'Выделить смысловую часть', type: 'heading' },
  { label: 'Маркированный список', hint: 'Перечислить требования', type: 'bulletList' },
  { label: 'Нумерованный список', hint: 'Описать последовательность', type: 'orderedList' },
  { label: 'Цитата', hint: 'Выделить важное замечание', type: 'blockquote' },
  { label: 'Блок кода', hint: 'JSON, XML, SQL или обычный текст', type: 'codeBlock' }
];

function CodeView({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  return <NodeViewWrapper className={`text-code-node ${node.attrs.wrap ? 'wrapped' : ''}`}>
    <div className="code-node-tools" contentEditable={false}>
      <select aria-label="Язык блока кода" value={node.attrs.language || 'text'} onChange={event => updateAttributes({ language: event.target.value })}>{['auto', 'text', 'json', 'xml', 'sql', 'javascript'].map(language => <option key={language}>{language}</option>)}</select>
      <div className="code-node-actions"><button aria-label="Перенос строк кода" aria-pressed={Boolean(node.attrs.wrap)} onClick={() => updateAttributes({ wrap: !node.attrs.wrap })}>Перенос</button><button onClick={async () => { try { await navigator.clipboard.writeText(node.textContent); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Скопировано' : 'Копировать'}</button></div>
    </div>
    <pre><code><NodeViewContent /></code></pre>
  </NodeViewWrapper>;
}
const DemoStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() || []).map(extension => extension.name === 'codeBlock' ? extension.extend({
      addAttributes() { return { language: { default: 'auto', parseHTML: (element: HTMLElement) => element.getAttribute('data-code-language') || element.querySelector('code')?.className.match(/language-([\w-]+)/)?.[1] || 'auto', renderHTML: (attributes: Record<string, unknown>) => ({ 'data-code-language': String(attributes.language) }) }, wrap: { default: false, parseHTML: (element: HTMLElement) => element.getAttribute('data-wrap') === 'true', renderHTML: (attributes: Record<string, unknown>) => ({ 'data-wrap': String(attributes.wrap) }) } }; },
      addNodeView() { return ReactNodeViewRenderer(CodeView); }
    }) : extension);
  }
});

type Props = { sectionId: string; value: string; onChange: (value: string) => void; onFocus: () => void };
export const INLINE_TEXT_FORMAT_LABELS = ['Жирный (Ctrl+B)', 'Курсив (Ctrl+I)', 'Встроенный код'] as const;
export function InlineTextSectionEditor({ sectionId, value, onChange, onFocus }: Props) {
  const onChangeRef = useRef(onChange);
  const lastValue = useRef(value);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const [menu, setMenu] = useState(false);
  const [menuMode, setMenuMode] = useState<'add' | 'convert'>('add');
  const targetBlock = useRef<{ from: number; to: number } | undefined>(undefined);
  const [targetCount, setTargetCount] = useState(1);
  const [row, setRow] = useState<{ top: number; end: number; start: number; empty: boolean }>();
  const [menuTop, setMenuTop] = useState(0);
  const insertion = useRef<{ end: number; start: number; empty: boolean } | undefined>(undefined);
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState('');
  const [bubble, setBubble] = useState<{ x: number; y: number }>();
  const shell = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const slashFrom = useRef<number | undefined>(undefined);
  const keyboard = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const editor = useEditor({
    extensions: [DemoStarterKit.configure({ heading: { levels: [3] }, codeBlock: { HTMLAttributes: { 'data-rich-code-block': '1' } } }), Highlight.configure({ multicolor: true })],
    content: value.trim() ? richTextToHtml(value, { editable: true }) : '<p></p>',
    onFocus,
    onBlur: () => setBubble(undefined),
    editorProps: { attributes: { class: 'rich-text-editor inline-text-editor', role: 'textbox', 'aria-label': 'Содержимое текстовой секции' }, handleKeyDown: (_view, event) => keyboard.current(event) },
    onUpdate: ({ editor: current }) => {
      const next = editorHtmlToWikiText(current.getHTML());
      lastValue.current = next;
      onChangeRef.current(next);
      if (slashFrom.current !== undefined) {
        const from = slashFrom.current; const to = current.state.selection.from;
        const value = to > from ? current.state.doc.textBetween(from, to) : '';
        if (!value.startsWith('/') || /\s/.test(value)) { slashFrom.current = undefined; setMenu(false); }
        else { setQuery(value.slice(1)); setSelected(0); }
      }
    },
    onSelectionUpdate: ({ editor: current }) => {
      if (current.state.selection.empty || current.isActive('codeBlock')) { setBubble(undefined); return; }
      const coords = current.view.coordsAtPos(current.state.selection.from);
      const bounds = shell.current?.getBoundingClientRect();
      if (bounds) setBubble({ x: Math.max(0, Math.min(coords.left - bounds.left, bounds.width - 220)), y: coords.top - bounds.top - 44 });
      const start = current.state.selection.$from.depth ? current.state.selection.$from.before(1) : current.state.selection.from;
      const node = current.state.doc.nodeAt(start);
      const element = current.view.nodeDOM(start);
      if (bounds && node && element instanceof HTMLElement) setRow({ top: element.getBoundingClientRect().top - bounds.top, start, end: start + node.nodeSize, empty: false });
    }
  });
  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    editor.commands.setContent(value.trim() ? richTextToHtml(value, { editable: true }) : '<p></p>', { emitUpdate: false });
    lastValue.current = value;
  }, [editor, value]);
  const state = useEditorState({ editor, selector: ({ editor: current }) => ({ bold: current?.isActive('bold'), italic: current?.isActive('italic'), code: current?.isActive('code'), codeBlock: current?.isActive('codeBlock'), language: current?.getAttributes('codeBlock').language || 'text' }) });
  const filtered = items.filter(item => `${item.label} ${item.hint}`.toLowerCase().includes(query.toLowerCase()));
  function closeMenu() { setMenu(false); slashFrom.current = undefined; insertion.current = undefined; targetBlock.current = undefined; setQuery(''); }
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenu(false); slashFrom.current = undefined; insertion.current = undefined; targetBlock.current = undefined; setQuery('');
      }
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [menu]);
  function choose(type: string) {
    if (!editor) return;
    if (menuMode === 'convert' && targetBlock.current) {
      const { from, to } = targetBlock.current;
      const chain = editor.chain().focus().setTextSelection({ from, to }).clearNodes();
      if (type === 'paragraph') chain.setParagraph();
      if (type === 'heading') chain.setHeading({ level: 3 });
      if (type === 'bulletList') chain.toggleBulletList();
      if (type === 'orderedList') chain.toggleOrderedList();
      if (type === 'blockquote') chain.toggleBlockquote();
      if (type === 'codeBlock') chain.setCodeBlock({ language: 'text' }).command(({ tr }) => {
        const blocks: { pos: number; size: number; text: string }[] = [];
        tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
          if (node.type.name === 'codeBlock' && pos < tr.selection.to && pos + node.nodeSize > tr.selection.from) { blocks.push({ pos, size: node.nodeSize, text: node.textContent }); return false; }
        });
        if (blocks.length > 1) {
          const first = blocks[0]; const last = blocks[blocks.length - 1];
          const text = blocks.map(block => block.text).join('\n');
          tr.replaceWith(first.pos, last.pos + last.size, tr.doc.type.schema.nodes.codeBlock.create({ language: 'text' }, text ? tr.doc.type.schema.text(text) : undefined));
        }
        return true;
      });
      chain.run(); closeMenu(); setRow(undefined); return;
    }
    if (insertion.current) {
      const { end, start, empty } = insertion.current;
      const paragraph = { type: 'paragraph' };
      const node = type === 'heading' ? { type, attrs: { level: 3 } } : type === 'codeBlock' ? { type, attrs: { language: 'json' } } : type === 'blockquote' ? { type, content: [paragraph] } : type === 'bulletList' || type === 'orderedList' ? { type, content: [{ type: 'listItem', content: [paragraph] }] } : paragraph;
      editor.chain().focus().insertContentAt(empty ? { from: start, to: end } : end, node).run();
      closeMenu(); return;
    }
    const chain = editor.chain().focus();
    if (slashFrom.current !== undefined) chain.deleteRange({ from: slashFrom.current, to: editor.state.selection.from });
    if (type === 'paragraph') chain.setParagraph();
    if (type === 'heading') chain.setHeading({ level: 3 });
    if (type === 'bulletList') chain.toggleBulletList();
    if (type === 'orderedList') chain.toggleOrderedList();
    if (type === 'blockquote') chain.toggleBlockquote();
    if (type === 'codeBlock') chain.setCodeBlock({ language: 'json' });
    chain.run(); closeMenu();
  }
  function handleEditorKey(event: KeyboardEvent) {
    if (event.key === '/' && editor && editor.state.selection.empty && editor.state.selection.$from.parent.type.name === 'paragraph' && editor.state.selection.$from.parent.content.size === 0) {
      slashFrom.current = editor.state.selection.from; insertion.current = undefined; setMenuMode('add'); setMenuTop(row?.top ?? 0); setMenu(true); setQuery(''); setSelected(0); return false;
    }
    if (!menu && event.key === 'Tab' && editor?.isActive('listItem')) {
      if (event.shiftKey) editor.chain().focus().liftListItem('listItem').run();
      else editor.chain().focus().sinkListItem('listItem').run();
      return true;
    }
    if (!menu) return false;
    if (event.key === 'Escape') { closeMenu(); return true; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { setSelected(value => filtered.length ? (value + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length : 0); return true; }
    if (event.key === 'Enter') { if (filtered[selected]) choose(filtered[selected].type); return true; }
    return false;
  };
  useEffect(() => { keyboard.current = handleEditorKey; });
  function openRowMenu(mode: 'add' | 'convert') {
    if (!row || !editor) return;
    insertion.current = mode === 'add' ? row : undefined;
    if (mode === 'convert') {
      const selection = editor.state.selection;
      const useSelection = !selection.empty;
      const from = useSelection ? selection.from : row.start + 1;
      const to = useSelection ? selection.to : row.end - 1;
      const blocks: { from: number; to: number }[] = [];
      editor.state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.isTextblock && (from === to ? pos < from && pos + node.nodeSize > from : pos + 1 < to && pos + node.nodeSize - 1 > from)) { blocks.push({ from: pos + 1, to: pos + node.nodeSize - 1 }); return false; }
      });
      targetBlock.current = blocks.length ? { from: blocks[0].from, to: blocks[blocks.length - 1].to } : { from, to };
      setTargetCount(Math.max(1, blocks.length));
    } else targetBlock.current = undefined;
    slashFrom.current = undefined; setBubble(undefined); setQuery(''); setSelected(0); setMenuMode(mode);
    const shellTop = shell.current?.getBoundingClientRect().top ?? 0;
    setMenuTop(window.innerHeight - shellTop - row.top - 28 < 360 ? Math.max(12 - shellTop, row.top - 388) : row.top); setMenu(true);
  }
  return <div className="notion-text-editor inline-text-editor-shell" data-section-id={sectionId}>
    <div className="editor-shell inline-text-editor-body" ref={shell} onMouseLeave={() => { if (!menu) setRow(undefined); }} onMouseMove={event => {
      if (!editor || menu || !shell.current) return;
      const blocks = Array.from(editor.view.dom.children) as HTMLElement[];
      const block = blocks.find(element => { const box = element.getBoundingClientRect(); return event.clientY >= box.top - 6 && event.clientY <= box.bottom + 6; });
      if (!block) return;
      const start = editor.view.posAtDOM(block, 0);
      const resolved = editor.state.doc.resolve(start);
      const before = resolved.depth ? resolved.before(1) : start;
      const node = editor.state.doc.nodeAt(before);
      if (node) setRow({ top: block.getBoundingClientRect().top - shell.current.getBoundingClientRect().top, start: before, end: before + node.nodeSize, empty: node.type.name === 'paragraph' && node.content.size === 0 });
    }} onKeyDown={event => { if (event.key === 'Escape') { setBubble(undefined); closeMenu(); } }}>
    {row && <div className="line-handles" style={{ top: row.top }}><button className="line-plus" aria-label="Добавить блок у строки" aria-expanded={menu && menuMode === 'add'} onMouseDown={event => event.preventDefault()} onClick={() => openRowMenu('add')}>＋</button><button className="line-grip" aria-label="Сменить тип блока" aria-expanded={menu && menuMode === 'convert'} onMouseDown={event => event.preventDefault()} onClick={() => openRowMenu('convert')}>⋮⋮</button></div>}
    {menu && <div ref={menuRef} className="block-menu line-menu" style={{ top: menuTop + 28 }} role="dialog" aria-label={menuMode === 'add' ? 'Добавить блок' : 'Действия блока'}>
      <input autoFocus aria-label="Поиск типа блока" placeholder="Найти блок…" value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => { if (keyboard.current(event.nativeEvent)) event.preventDefault(); }} /><div className="menu-caption">{menuMode === 'convert' ? `СМЕНИТЬ ТИП · БЛОКОВ: ${targetCount}` : 'ДОБАВИТЬ БЛОК'}</div><div role="menu">{filtered.map((item, index) => <button key={item.type} role="menuitem" className={selected === index ? 'chosen' : ''} onMouseDown={event => event.preventDefault()} onClick={() => choose(item.type)}><span className="block-glyph">{['paragraph','heading'].includes(item.type) ? 'T' : item.type === 'codeBlock' ? '</>' : item.type === 'blockquote' ? '❝' : '☷'}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}{!filtered.length && <p>Нет подходящих блоков</p>}</div>
    </div>}
    {bubble && <div className="format-bubble" role="toolbar" aria-label="Форматирование" style={{ left: bubble.x, top: bubble.y }}><button aria-label={INLINE_TEXT_FORMAT_LABELS[0]} aria-pressed={Boolean(state?.bold)} onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()}><b>B</b></button><button aria-label={INLINE_TEXT_FORMAT_LABELS[1]} aria-pressed={Boolean(state?.italic)} onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></button><button aria-label={INLINE_TEXT_FORMAT_LABELS[2]} aria-pressed={Boolean(state?.code)} onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().toggleCode().run()}>&lt;/&gt;</button></div>}<EditorContent editor={editor} /></div>

  </div>;
}
