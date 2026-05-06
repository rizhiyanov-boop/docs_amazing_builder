import { describe, expect, it } from 'vitest';
import { isRequired } from './WorkbenchTables';

describe('WorkbenchTables isRequired', () => {
  it('treats plus as required marker', () => {
    expect(isRequired('+')).toBe(true);
  });
});
