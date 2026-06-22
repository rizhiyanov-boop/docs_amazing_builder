import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InlineSectionTitle } from './InlineSectionTitle';

describe('InlineSectionTitle', () => {
  it('commits on Enter and restores the initial value on Escape', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<InlineSectionTitle value="Initial title" onCommit={onCommit} />);

    const title = screen.getByRole('textbox', { name: 'Название секции' });
    await user.click(title);
    title.textContent = 'Updated title';
    fireEvent.input(title);
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith('Updated title');

    await user.click(title);
    title.textContent = 'Cancelled title';
    fireEvent.input(title);
    await user.keyboard('{Escape}');
    expect(title).toHaveTextContent('Initial title');
  });
});
