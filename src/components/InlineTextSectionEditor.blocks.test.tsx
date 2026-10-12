import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { InlineTextSectionEditor } from './InlineTextSectionEditor';
import { richTextToHtml } from '../richText';
const captured = vi.hoisted(() => ({ editor: null as Editor | null }));
vi.mock('@tiptap/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return { ...actual, useEditor: (...args: Parameters<typeof actual.useEditor>) => { const editor = actual.useEditor(...args); captured.editor = editor; return editor; } };
});
afterEach(() => { cleanup(); captured.editor = null; });
beforeEach(() => {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
function fixture(value = 'First paragraph\n\nSecond paragraph\n\nUntouched paragraph') {
  const onChange = vi.fn(); render(<InlineTextSectionEditor sectionId="test" value={value} onChange={onChange} onFocus={vi.fn()} />);
  return { onChange, editor: captured.editor! };
}
function openTypes() { fireEvent.mouseMove(screen.getByRole('textbox'), { clientY: 1 }); fireEvent.click(screen.getByRole('button', { name: 'Сменить тип блока' })); }
describe('Text block workflows', () => {
  it('opens types directly and closes only outside or on Escape', () => {
    fixture(); openTypes();
    expect(screen.queryByText('Дублировать')).not.toBeInTheDocument();
    expect(screen.queryByText('Удалить')).not.toBeInTheDocument();
    fireEvent.pointerDown(screen.getByLabelText('Поиск типа блока')); expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.pointerDown(document.body); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openTypes(); fireEvent.keyDown(screen.getByLabelText('Поиск типа блока'), { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('converts selected paragraphs to one code block, excludes the next boundary paragraph, and supports undo', () => {
    const { editor, onChange } = fixture();
    const boundary = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 1;
    act(() => { editor.commands.setTextSelection({ from: 1, to: boundary }); }); openTypes();
    expect(screen.getByText('СМЕНИТЬ ТИП · БЛОКОВ: 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Блок кода/ }));
    expect(editor.state.doc.child(0).type.name).toBe('codeBlock');
    expect(editor.state.doc.child(0).textContent).toBe('First paragraph\nSecond paragraph');
    expect(editor.state.doc.child(1).textContent).toBe('Untouched paragraph');
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('{code'));
    act(() => { editor.commands.undo(); }); expect(editor.state.doc.child(0).type.name).toBe('paragraph');
  });
  it('preserves code language, indentation and blank lines through edit/save/reload', async () => {
    const { editor, onChange } = fixture('{code:json}\n{\n  "one": 1,\n\n\n  "two": 2\n}\n{code}');
    expect(await screen.findByLabelText('Язык блока кода')).toHaveValue('json');
    act(() => { editor.commands.setTextSelection(2); editor.commands.insertContent(' '); });
    const saved = onChange.mock.calls.at(-1)![0] as string;
    expect(saved).toContain('{code:json}'); expect(saved).toContain('\n\n\n  "two": 2');
    act(() => { editor.commands.setContent(richTextToHtml(saved, { editable: true }), { emitUpdate: false }); });
    expect(editor.state.doc.child(0).attrs.language).toBe('json'); expect(editor.state.doc.child(0).textContent).toContain('\n\n\n  "two": 2');
  });
});
