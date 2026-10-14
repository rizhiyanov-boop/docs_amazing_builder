import type { ReactNode } from 'react';
import type { ParsedSection } from '../types';
import { WBButton } from './primitives/WorkbenchPrimitives';
import { WorkbenchIcon } from './workbench/WorkbenchIcon';

type ParsedSectionEditorProps = {
  section: ParsedSection;
  isDualModelSection: (section: ParsedSection) => boolean;
  renderRequestEditor: (section: ParsedSection) => ReactNode;
  renderSourceEditor: (section: ParsedSection, target: 'server' | 'client', title?: string) => ReactNode;
  onAddManualRow: (section: ParsedSection) => void;
  renderParsedTable: (section: ParsedSection) => ReactNode;
};

export function ParsedSectionEditor({
  section,
  isDualModelSection,
  renderRequestEditor,
  renderSourceEditor,
  onAddManualRow,
  renderParsedTable
}: ParsedSectionEditorProps): ReactNode {
  if (isDualModelSection(section)) {
    return (
      <section className="ds-section-card dual-model-section-card">
        <div className="ds-section-card-body">{renderRequestEditor(section)}</div>
      </section>
    );
  }

  return (
    <section className="ds-section-card">
      <header className="ds-section-card-head">
        <div className="ds-section-card-eyebrow">{section.format.toUpperCase()}</div>
      </header>
      <div className="ds-section-card-body stack">
        {renderSourceEditor(section, 'server')}
        <div className="row gap">
          <WBButton variant="ghost" size="sm" aria-label="+ Параметр" icon={<WorkbenchIcon name="plus" />} onClick={() => onAddManualRow(section)}>Параметр</WBButton>
        </div>
        {section.error && <div className="alert error">{section.error}</div>}
        {renderParsedTable(section)}
      </div>
    </section>
  );
}
