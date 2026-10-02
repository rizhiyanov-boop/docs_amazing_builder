import type { ReactNode } from 'react';
import type { RequestColumnKey } from '../../types';

// Reserve space for text, cell padding and inline controls. Narrow panes scroll
// horizontally instead of squeezing field paths into single-character columns.
const COLUMN_WIDTHS: Record<RequestColumnKey, number> = {
  field: 320,
  type: 136,
  required: 128,
  validations: 248,
  clientField: 360,
  description: 280,
  maskInLogs: 116,
  example: 224
};

type ParsedTableFrameProps = {
  columns: RequestColumnKey[];
  fieldColumnWidth: number;
  label: string;
  children: ReactNode;
};

export function ParsedTableFrame({ columns, fieldColumnWidth, label, children }: ParsedTableFrameProps): ReactNode {
  const widths = columns.map(column => column === 'field' ? fieldColumnWidth : COLUMN_WIDTHS[column]);
  const minimumWidth = widths.reduce((total, width) => total + width, 0);

  return (
    <div className="parsed-table-viewport" role="region" aria-label={label} tabIndex={0}>
      <table className="parsed-table" style={{ minWidth: minimumWidth }}>
        <colgroup>
          {columns.map((column, index) => (
            <col key={column} className={`table-col table-col-${column}`} style={{ width: widths[index] }} />
          ))}
        </colgroup>
        {children}
      </table>
    </div>
  );
}
