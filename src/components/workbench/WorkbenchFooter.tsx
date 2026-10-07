import { useEffect, useId, useRef, useState } from 'react';
import { APP_VERSION, RELEASE_NOTES } from '../../releaseNotes';
import { WBButton } from '../primitives/WorkbenchPrimitives';
import './WorkbenchFooter.css';

export function WorkbenchFooter() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);

  return <>
    <footer className="wb-footer" aria-label="Версия приложения">
      <button type="button" className="wb-footer-version" aria-label={`Версия ${APP_VERSION}. Журнал изменений`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        DocBuilder · {APP_VERSION}
      </button>
    </footer>
    <dialog ref={dialogRef} className="wb-release-dialog" aria-labelledby={titleId} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onKeyDown={event => event.stopPropagation()} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="wb-release-card">
        <header className="wb-release-header">
          <h2 id={titleId}>Журнал изменений</h2>
          <WBButton variant="ghost" size="sm" onClick={() => setOpen(false)}>Закрыть</WBButton>
        </header>
        <div className="wb-release-list">
          {RELEASE_NOTES.map(release => <section key={release.version} className="wb-release-entry" aria-label={`Версия ${release.version}`}>
            <h3>{release.version}{release.version === APP_VERSION && <span className="wb-release-current">Текущая</span>}</h3>
            <p className="wb-release-title">{release.title}</p>
            <ul>{release.changes.map(change => <li key={change}>{change}</li>)}</ul>
          </section>)}
        </div>
      </div>
    </dialog>
  </>;
}
