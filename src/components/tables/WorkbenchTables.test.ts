import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { isRequired } from './WorkbenchTables.utils';
import { TableClassic } from './WorkbenchTables';
import { makeParsedRow } from '../../test/fixtures';

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('WorkbenchTables isRequired', () => {
  it('treats plus as required marker', () => {
    expect(isRequired('+')).toBe(true);
  });

  it('hides row menu button when onRowMenu is not passed', () => {
    render(React.createElement(TableClassic, { rows: [makeParsedRow({ field: 'id', type: 'string', required: '+' })] }));
    expect(screen.queryByRole('button', { name: 'Меню строки' })).not.toBeInTheDocument();
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

  it('adds row from inline form with entered field and selected type', () => {
    const onAddRow = vi.fn();
    render(React.createElement(TableClassic, {
      rows: [makeParsedRow({ field: 'id', type: 'string', required: '+' })],
      editable: true,
      onAddRow
    }));

    const addButton = screen.getByRole('button', { name: 'Добавить поле' });
    expect(addButton).toBeDisabled();

    const fieldInput = screen.getByRole('textbox', { name: 'Новое поле' });
    fireEvent.change(fieldInput, { target: { value: 'orderId' } });
    const typeSelect = screen.getByRole('combobox', { name: 'Тип нового поля' });
    fireEvent.change(typeSelect, { target: { value: 'int' } });
    fireEvent.keyDown(fieldInput, { key: 'Enter' });

    expect(onAddRow).toHaveBeenCalledTimes(1);
    expect(onAddRow).toHaveBeenCalledWith('orderId', 'int');
  });

  it('clears add row inline form on Escape without adding row', () => {
    const onAddRow = vi.fn();
    render(React.createElement(TableClassic, {
      rows: [makeParsedRow({ field: 'id', type: 'string', required: '+' })],
      editable: true,
      onAddRow
    }));

    const fieldInput = screen.getByRole('textbox', { name: 'Новое поле' }) as HTMLInputElement;
    fireEvent.change(fieldInput, { target: { value: 'tmpField' } });
    fireEvent.keyDown(fieldInput, { key: 'Escape' });

    expect(fieldInput.value).toBe('');
    expect(onAddRow).not.toHaveBeenCalled();
  });

  it('moves focus vertically within the edited column with Tab and Shift+Tab', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(React.createElement(TableClassic, {
      rows: [
        makeParsedRow({ id: 'row-1', field: 'id', type: 'string', required: '+', description: 'First' }),
        makeParsedRow({ id: 'row-2', field: 'amount', type: 'number', required: '-', description: 'Second' })
      ],
      editable: true,
      onUpdateRow: vi.fn(),
      onAddRow: vi.fn()
    }));

    const fields = Array.from(container.querySelectorAll<HTMLElement>('[data-table-column="field"]'));
    const types = Array.from(container.querySelectorAll<HTMLElement>('[data-table-column="type"]'));
    const descriptions = Array.from(container.querySelectorAll<HTMLElement>('[data-table-column="description"]'));

    fields[0].focus();
    fireEvent.keyDown(fields[0], { key: 'Tab' });
    expect(fields[1]).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

    types[0].focus();
    fireEvent.keyDown(types[0], { key: 'Tab' });
    expect(types[1]).toHaveFocus();

    descriptions[1].focus();
    fireEvent.keyDown(descriptions[1], { key: 'Tab', shiftKey: true });
    expect(descriptions[0]).toHaveFocus();

    expect(fireEvent.keyDown(fields[1], { key: 'Tab' })).toBe(true);
  });
});
