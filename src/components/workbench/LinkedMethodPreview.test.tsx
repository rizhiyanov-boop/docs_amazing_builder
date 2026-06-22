import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MethodDocument } from '../../types';
import { LinkedMethodPreview } from './LinkedMethodPreview';

const methods: MethodDocument[] = [
  {
    id: 'one',
    name: 'First method',
    updatedAt: '2026-01-01',
    sections: [{ id: 'goal-one', title: 'Цель', enabled: true, kind: 'text', value: 'First content' }]
  },
  {
    id: 'two',
    name: 'Second method',
    updatedAt: '2026-01-01',
    sections: [{
      id: 'request-two',
      title: 'Request',
      enabled: true,
      kind: 'parsed',
      sectionType: 'request',
      format: 'json',
      input: '{}',
      rows: [{ field: 'customerId', type: 'string', required: '+', description: 'Customer', example: '42', source: 'body' }],
      error: ''
    }]
  }
];

describe('LinkedMethodPreview', () => {
  it('renders method content without editable controls', () => {
    render(
      <LinkedMethodPreview
        methods={methods}
        selectedMethodId="two"
        onSelectMethod={vi.fn()}
        onClose={vi.fn()}
        getMethodHttpMethod={() => 'POST'}
        getMethodPath={(method) => `/${method?.id ?? ''}`}
      />
    );
    expect(screen.getByText('customerId')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Project Docs' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('filters and selects a method, then restores focus', async () => {
    const user = userEvent.setup();
    const onSelectMethod = vi.fn();
    render(
      <LinkedMethodPreview
        methods={methods}
        selectedMethodId="one"
        onSelectMethod={onSelectMethod}
        onClose={vi.fn()}
        getMethodHttpMethod={() => 'POST'}
        getMethodPath={(method) => `/${method?.id ?? ''}`}
      />
    );
    const picker = screen.getByRole('button', { name: /First method/ });
    await user.click(picker);
    await user.type(screen.getByRole('textbox', { name: 'Поиск связанного метода' }), 'Second');
    const listbox = screen.getByRole('listbox', { name: 'Методы проекта' });
    await user.click(within(listbox).getByRole('option', { name: /Second method/ }));
    expect(onSelectMethod).toHaveBeenCalledWith('two');
    expect(picker).toHaveFocus();
  });
});
