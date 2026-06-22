export type VerticalTableKind = 'parameters' | 'headers';
export type VerticalCellColumn =
  | 'field'
  | 'clientField'
  | 'type'
  | 'required'
  | 'description'
  | 'maskInLogs'
  | 'example';
export type VerticalCellTarget = 'server' | 'client';

export type VerticalCellAddress = {
  table: VerticalTableKind;
  sectionId: string;
  target: VerticalCellTarget;
  rowKey: string;
  column: VerticalCellColumn;
};

export function getVerticalCellKey(address: VerticalCellAddress): string {
  return [address.table, address.sectionId, address.target, address.column, address.rowKey].join(':');
}

export function findVerticalCellTarget(
  addresses: VerticalCellAddress[],
  current: VerticalCellAddress,
  direction: 1 | -1
): VerticalCellAddress | null {
  const columnAddresses = addresses.filter(
    (address) =>
      address.table === current.table &&
      address.sectionId === current.sectionId &&
      address.target === current.target &&
      address.column === current.column
  );
  const currentIndex = columnAddresses.findIndex((address) => address.rowKey === current.rowKey);
  if (currentIndex === -1) return null;
  return columnAddresses[currentIndex + direction] ?? null;
}
