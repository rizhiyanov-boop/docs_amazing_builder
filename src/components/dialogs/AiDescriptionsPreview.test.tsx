import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiDescriptionsPreview } from './AiDescriptionsPreview';

afterEach(() => {
  cleanup();
});

describe('AiDescriptionsPreview', () => {
  it('renders suggestions and allows selecting already filled items', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <AiDescriptionsPreview
        suggestions={[
          { field: 'orderId', description: 'ID заказа', accepted: true, locked: false },
          { field: 'status', description: 'Статус заказа', accepted: false, locked: true }
        ]}
        onToggle={onToggle}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[1]).not.toBeDisabled();

    await user.click(checkboxes[0]);
    expect(onToggle).toHaveBeenCalledWith('orderId', false);
    await user.click(checkboxes[1]);
    expect(onToggle).toHaveBeenCalledWith('status', true);
  });

  it('calls action callbacks', async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    const onSelectNone = vi.fn();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <AiDescriptionsPreview
        suggestions={[{ field: 'orderId', description: 'ID заказа', accepted: true, locked: false }]}
        onToggle={vi.fn()}
        onSelectAll={onSelectAll}
        onSelectNone={onSelectNone}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Выбрать все' }));
    await user.click(screen.getByRole('button', { name: 'Снять все' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await user.click(screen.getByRole('button', { name: /Применить/i }));

    expect(onSelectAll).toHaveBeenCalledTimes(1);
    expect(onSelectNone).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
