import type { ReactNode } from 'react';

export type WorkbenchIconName = 'document' | 'search' | 'command' | 'menu' | 'export' | 'chevron' | 'json' | 'html' | 'wiki' | 'confluence' | 'undo' | 'redo' | 'more' | 'check' | 'alert' | 'spinner' | 'plus';

export function WorkbenchIcon({ name }: { name: WorkbenchIconName }): ReactNode {
  if (name === 'confluence') return <svg className="wb-shell-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none"><path d="M3 17c2-4 4-6 7-6 3 0 5 3 11 6l-3 5c-5-3-7-6-9-6-1 0-2 1-3 3zM21 7c-2 4-4 6-7 6-3 0-5-3-11-6l3-5c5 3 7 6 9 6 1 0 2-1 3-3z" /></svg>;
  const shapes: Record<Exclude<WorkbenchIconName, 'confluence'>, ReactNode> = {
    document: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    command: <path d="M9 7V4.5A2.5 2.5 0 1 0 6.5 7H17.5A2.5 2.5 0 1 0 15 4.5V19.5A2.5 2.5 0 1 0 17.5 17H6.5A2.5 2.5 0 1 0 9 19.5Z" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    export: <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    json: <path d="M8 4H6v6l-2 2 2 2v6h2M16 4h2v6l2 2-2 2v6h-2" />,
    html: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
    wiki: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />,
    undo: <path d="M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13" />,
    redo: <path d="M21 7v6h-6M3 17a9 9 0 0 1 15-6.7l3 2.7" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>,
    spinner: <path d="M21 12a9 9 0 1 1-9-9" />,
    plus: <path d="M12 5v14M5 12h14" />
  };
  return <svg className={`wb-shell-icon${name === 'spinner' ? ' wb-shell-spinner' : ''}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}
