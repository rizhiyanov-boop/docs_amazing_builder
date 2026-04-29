import type { ReactNode } from 'react';
import type { ParsedSection } from '../types';

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
      <section className="ds-section-card">
        <header className="ds-section-card-head">
          <div className="ds-section-card-eyebrow">{section.sectionType === 'request' ? 'REQUEST' : 'RESPONSE'}</div>
          <h3 className="ds-section-card-title">{section.title}</h3>
        </header>
        <div className="ds-section-card-body">{renderRequestEditor(section)}</div>
      </section>
    );
  }

  return (
    <section className="ds-section-card">
      <header className="ds-section-card-head">
        <div className="ds-section-card-eyebrow">{section.format.toUpperCase()}</div>
        <h3 className="ds-section-card-title">{section.title}</h3>
      </header>
      <div className="ds-section-card-body stack">
        {renderSourceEditor(section, 'server')}
        <div className="row gap">
          <button className="ghost small" type="button" onClick={() => onAddManualRow(section)}>
            + Параметр
          </button>
        </div>
        {section.error && <div className="alert error">{section.error}</div>}
        {renderParsedTable(section)}
      </div>
    </section>
  );
}
