import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { isRequired } from './WorkbenchTables';
import { TableClassic } from './WorkbenchTables';
import { makeParsedRow } from '../../test/fixtures';

afterEach(() => {
  cleanup();
});

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

  it('moves focus with Tab in row order and with Shift+Tab backwards', () => {
    render(React.createElement(TableClassic, {
      rows: [makeParsedRow({ field: 'id', type: 'string', required: '+', description: '' })],
      editable: true,
      onUpdateRow: vi.fn(),
      onAddRow: vi.fn()
    }));

    const fieldInput = screen.getByRole('textbox', { name: 'Имя поля' });
    const typeSelect = screen.getByRole('combobox', { name: 'Тип поля' });
    const descriptionInput = screen.getByRole('textbox', { name: 'Описание поля' });
    const newFieldInput = screen.getByRole('textbox', { name: 'Новое поле' });

    fieldInput.focus();
    fireEvent.keyDown(fieldInput, { key: 'Tab' });
    expect(typeSelect).toHaveFocus();

    fireEvent.keyDown(typeSelect, { key: 'Tab' });
    expect(descriptionInput).toHaveFocus();

    fireEvent.keyDown(descriptionInput, { key: 'Tab' });
    expect(newFieldInput).toHaveFocus();

    fireEvent.keyDown(newFieldInput, { key: 'Tab', shiftKey: true });
    expect(descriptionInput).toHaveFocus();
  });
});
