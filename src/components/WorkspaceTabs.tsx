import type { ReactNode } from 'react';

type WorkspaceTabKey = 'editor' | 'html' | 'wiki';

type WorkspaceTabsProps = {
  tab: WorkspaceTabKey;
  onOpenEditor: () => void;
  onOpenHtml: () => void;
  onOpenWiki: () => void;
};

export function WorkspaceTabs({ tab, onOpenEditor, onOpenHtml, onOpenWiki }: WorkspaceTabsProps): ReactNode {
  return (
    <div className="tabs" role="tablist" aria-label="Режим рабочей области">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'editor'}
        className={`tab ${tab === 'editor' ? 'active' : ''}`}
        onClick={onOpenEditor}
      >
        Редактор
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'html'}
        className={`tab ${tab === 'html' ? 'active' : ''}`}
        onClick={onOpenHtml}
      >
        HTML
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'wiki'}
        className={`tab ${tab === 'wiki' ? 'active' : ''}`}
        onClick={onOpenWiki}
      >
        Wiki
      </button>
    </div>
  );
}
