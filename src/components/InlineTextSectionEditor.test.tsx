import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INLINE_TEXT_FORMAT_LABELS, InlineTextSectionEditor } from './InlineTextSectionEditor';

afterEach(cleanup);

describe('InlineTextSectionEditor', () => {
  it('keeps the inline toolbar visible before, during and after editing', () => {
    render(<InlineTextSectionEditor sectionId="focus-section" value="Text" onChange={vi.fn()} onFocus={vi.fn()} />);
    const textbox = screen.getByRole('textbox', { name: 'Содержимое текстовой секции' });
    expect(screen.getByRole('toolbar', { name: 'Форматирование' })).toBeVisible();
    fireEvent.focus(textbox);
    const toolbar = screen.getByRole('toolbar', { name: 'Форматирование' });
    const bold = screen.getByRole('button', { name: 'Жирный (Ctrl+B)' });
    fireEvent.blur(textbox, { relatedTarget: bold });
    expect(toolbar).toBeVisible();
    fireEvent.focus(bold);
    fireEvent.blur(bold, { relatedTarget: document.body });
    expect(toolbar).toBeVisible();
  });

  it('renders always-editable content and the exact formatting command set', () => {
    render(
      <InlineTextSectionEditor
        sectionId="section-1"
        value="Editable text"
        onChange={vi.fn()}
        onFocus={vi.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: 'Содержимое текстовой секции' })).toHaveTextContent('Editable text');
    expect(INLINE_TEXT_FORMAT_LABELS).toEqual([
      'Жирный (Ctrl+B)',
      'Курсив (Ctrl+I)',
      'Встроенный код',
      'Подзаголовок',
      'Цитата',
      'Маркированный список',
      'Нумерованный список'
    ]);
    expect(screen.queryByRole('button', { name: 'Выделение цветом', hidden: true })).not.toBeInTheDocument();
  });

  it('keeps legacy highlights renderable without exposing a highlight command', () => {
    render(
      <InlineTextSectionEditor
        sectionId="section-highlight"
        value="{highlight:#fef08a}Legacy highlight{highlight}"
        onChange={vi.fn()}
        onFocus={vi.fn()}
      />
    );

    expect(document.querySelector('.inline-text-editor mark')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Выделение цветом', hidden: true })).not.toBeInTheDocument();
  });
});
