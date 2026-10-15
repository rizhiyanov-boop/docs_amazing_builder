import { useCallback, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import type { RequestColumnKey } from '../../types';
import { WorkbenchIcon } from '../workbench/WorkbenchIcon';

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
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ overflow: false, right: false, left: false, sticky: false });
  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = {
      overflow: viewport.scrollWidth > viewport.clientWidth + 1,
      right: viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft > 1,
      left: viewport.scrollLeft > 1,
      // Leave useful room beside the pinned field, including on narrow panes.
      sticky: viewport.clientWidth > fieldColumnWidth + 240
    };
    setScrollState(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
  }, [fieldColumnWidth]);

  useLayoutEffect(() => {
    measure();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, minimumWidth]);

  function scrollColumns(direction: -1 | 1) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const step = Math.max(120, (viewport.clientWidth - (scrollState.sticky ? fieldColumnWidth : 0)) * 0.8);
    viewport.scrollBy({ left: direction * step, behavior: 'auto' });
  }

  function revealFocusedControl(event: FocusEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const target = event.target;
    if (!viewport || viewport.clientWidth === 0 || !(target instanceof HTMLElement)) return;
    const cell = target.closest<HTMLTableCellElement>('td, th');
    if (!cell || cell.dataset.column === 'field') return;
    const bounds = viewport.getBoundingClientRect();
    const field = cell.parentElement?.querySelector<HTMLTableCellElement>('[data-column="field"]');
    const fieldBounds = field?.getBoundingClientRect();
    const pinnedBeforeCell = scrollState.sticky && field && field.cellIndex < cell.cellIndex && fieldBounds && fieldBounds.left <= bounds.left + 1;
    const left = pinnedBeforeCell ? fieldBounds.right : bounds.left;
    const control = target.getBoundingClientRect();
    if (control.left < left + 8) {
      viewport.scrollBy({ left: control.left - left - 8, behavior: 'auto' });
    } else if (control.right > bounds.right - 8) {
      viewport.scrollBy({ left: control.right - bounds.right + 8, behavior: 'auto' });
    }
  }

  return (
    <div className="parsed-table-frame" data-sticky-field={scrollState.sticky} data-scrolled={scrollState.left}>
      {scrollState.overflow && (
        <div className="parsed-table-overflow">
          <button type="button" className="parsed-table-overflow-hint" data-direction="left" disabled={!scrollState.left} onClick={() => scrollColumns(-1)}
            aria-label={`Показать колонки слева: ${label}`}>
            <WorkbenchIcon name="chevron" />
            Показать слева
          </button>
          <button type="button" className="parsed-table-overflow-hint" data-direction="right" disabled={!scrollState.right} onClick={() => scrollColumns(1)}
            aria-label={`Показать колонки справа: ${label}`}>
            Показать справа
            <WorkbenchIcon name="chevron" />
          </button>
        </div>
      )}
      <div ref={viewportRef} className="parsed-table-viewport" role="region" aria-label={label} tabIndex={0} onScroll={measure} onFocusCapture={revealFocusedControl}>
      <table className="parsed-table" style={{ minWidth: minimumWidth }}>
        <colgroup>
          {columns.map((column, index) => (
            <col key={column} className={`table-col table-col-${column}`} style={{ width: widths[index] }} />
          ))}
        </colgroup>
        {children}
      </table>
      </div>
    </div>
  );
}
