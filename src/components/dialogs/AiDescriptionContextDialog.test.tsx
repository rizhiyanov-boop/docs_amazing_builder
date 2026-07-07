import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiDescriptionContextDialog, AI_DESCRIPTION_CONTEXT_MAX_LENGTH } from './AiDescriptionContextDialog';

afterEach(() => {
  cleanup();
});

describe('AiDescriptionContextDialog', () => {
  it('submits empty context and reports the character counter', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <AiDescriptionContextDialog
        value=""
        onChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog', { name: 'AI context for descriptions' })).toBeInTheDocument();
    expect(screen.getByText(`0 / ${AI_DESCRIPTION_CONTEXT_MAX_LENGTH}`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Запустить AI' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('blocks submit when context is longer than the limit', () => {
    render(
      <AiDescriptionContextDialog
        value={'x'.repeat(AI_DESCRIPTION_CONTEXT_MAX_LENGTH + 1)}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Запустить AI' })).toBeDisabled();
    expect(screen.getByText('Сократите контекст перед запуском AI')).toBeInTheDocument();
  });

  it('closes on Escape without submitting', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AiDescriptionContextDialog
        value="source fragment"
        onChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
