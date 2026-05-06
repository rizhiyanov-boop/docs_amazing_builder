import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
