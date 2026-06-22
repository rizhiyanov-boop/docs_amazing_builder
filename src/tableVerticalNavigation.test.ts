import { describe, expect, it } from 'vitest';
import { findVerticalCellTarget, type VerticalCellAddress } from './tableVerticalNavigation';

const addresses: VerticalCellAddress[] = [
  { table: 'parameters', sectionId: 'request', target: 'server', rowKey: 'a', column: 'description' },
  { table: 'parameters', sectionId: 'request', target: 'server', rowKey: 'b', column: 'description' },
  { table: 'parameters', sectionId: 'request', target: 'client', rowKey: 'c', column: 'description' },
  { table: 'parameters', sectionId: 'request', target: 'server', rowKey: 'a', column: 'example' },
  { table: 'headers', sectionId: 'request', target: 'server', rowKey: 'h1', column: 'description' }
];

describe('findVerticalCellTarget', () => {
  it('moves only within the same table, section, side and column', () => {
    expect(findVerticalCellTarget(addresses, addresses[0], 1)).toEqual(addresses[1]);
    expect(findVerticalCellTarget(addresses, addresses[1], -1)).toEqual(addresses[0]);
  });

  it('returns null at column boundaries', () => {
    expect(findVerticalCellTarget(addresses, addresses[0], -1)).toBeNull();
    expect(findVerticalCellTarget(addresses, addresses[1], 1)).toBeNull();
  });
});
