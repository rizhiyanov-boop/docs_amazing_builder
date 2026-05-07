import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { isRequired } from './WorkbenchTables';
import { TableClassic } from './WorkbenchTables';
import { makeParsedRow } from '../../test/fixtures';

describe('WorkbenchTables isRequired', () => {
  it('treats plus as required marker', () => {
    expect(isRequired('+')).toBe(true);
  });

  it('hides row menu button when onRowMenu is not passed', () => {
    render(React.createElement(TableClassic, { rows: [makeParsedRow({ field: 'id', type: 'string', required: '+' })] }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders readonly type chip when row update handler is not passed', () => {
    render(React.createElement(TableClassic, { rows: [makeParsedRow({ field: 'id', type: 'string', required: '+' })] }));
    expect(screen.queryByRole('combobox', { name: 'Тип поля' })).not.toBeInTheDocument();
    expect(screen.getByText('string')).toBeInTheDocument();
  });

  it('changes row type via inline select when update handler is provided', () => {
    const onUpdateRow = vi.fn();
    render(React.createElement(TableClassic, {
      rows: [makeParsedRow({ field: 'id', type: 'string', required: '+' })],
      editable: true,
      onUpdateRow
    }));

    const typeSelect = screen.getByRole('combobox', { name: 'Тип поля' });
    fireEvent.change(typeSelect, { target: { value: 'int' } });

    expect(onUpdateRow).toHaveBeenCalledTimes(1);
    expect(onUpdateRow.mock.calls[0]?.[1]).toEqual({ type: 'int' });
  });
});
