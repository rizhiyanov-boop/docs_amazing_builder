import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { INLINE_TEXT_FORMAT_LABELS, InlineTextSectionEditor } from './InlineTextSectionEditor';

describe('InlineTextSectionEditor', () => {
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
