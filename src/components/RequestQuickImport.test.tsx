import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestQuickImport } from './RequestQuickImport';

afterEach(() => {
  cleanup();
});

describe('RequestQuickImport', () => {
  it('handles text input, auto-detects format, and triggers onApply', () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();

    render(
      <RequestQuickImport
        isDualModel={true}
        onApply={onApply}
        onCancel={onCancel}
      />
    );

    const textarea = screen.getByRole('textbox', { name: 'Текст для импорта параметров' });
    fireEvent.change(textarea, { target: { value: '{"userId": 123}' } });

    // Click apply button
    fireEvent.click(screen.getByRole('button', { name: /Распарсить в Server/i }));
    expect(onApply).toHaveBeenCalledWith('{"userId": 123}', 'json', 'server');
  });

  it('allows switching target to client in dual model', () => {
    const onApply = vi.fn();

    render(
      <RequestQuickImport
        isDualModel={true}
        onApply={onApply}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Клиент' }));
    const textarea = screen.getByRole('textbox', { name: 'Текст для импорта параметров' });
    fireEvent.change(textarea, { target: { value: '{"clientToken": "abc"}' } });

    fireEvent.click(screen.getByRole('button', { name: /Распарсить в Client/i }));
    expect(onApply).toHaveBeenCalledWith('{"clientToken": "abc"}', 'json', 'client');
  });

  it('triggers onCancel when clicking Cancel button', () => {
    const onCancel = vi.fn();

    render(
      <RequestQuickImport
        isDualModel={false}
        onApply={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
