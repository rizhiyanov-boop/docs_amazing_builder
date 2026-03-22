import type { ReactNode } from 'react';
import { RequestAuthEditor } from './RequestAuthEditor';
import { RequestMetaEditor } from './RequestMetaEditor';
import type { ParsedRow, ParsedSection } from '../types';

type ParseTarget = 'server' | 'client';

type RequestEditorProps = {
  section: ParsedSection;
  getSectionSideLabel: (section: ParsedSection, target: ParseTarget) => string;
  isResponseSection: (section: ParsedSection) => boolean;
  isRequestSection: (section: ParsedSection) => boolean;
  isDualModelSection: (section: ParsedSection) => boolean;
  isExpanderOpen: (sectionId: string, blockId: string) => boolean;
  setExpanderOpen: (sectionId: string, blockId: string, isOpen: boolean) => void;
  getExternalSourceRows: (section: ParsedSection) => ParsedRow[];
  getRequestHeaderRowsForEditor: (section: ParsedSection) => ParsedRow[];
  renderRequestHeadersTable: (section: ParsedSection, target: ParseTarget) => ReactNode;
  renderSourceEditor: (section: ParsedSection, target: ParseTarget, title?: string) => ReactNode;
  renderParsedTable: (section: ParsedSection) => ReactNode;
  updateParsedSection: (id: string, updater: (section: ParsedSection) => ParsedSection) => void;
  requestCellError: string;
};

export function RequestEditor({
  section,
  getSectionSideLabel,
  isResponseSection,
  isRequestSection,
  isDualModelSection,
  isExpanderOpen,
  setExpanderOpen,
  getExternalSourceRows,
  getRequestHeaderRowsForEditor,
  renderRequestHeadersTable,
  renderSourceEditor,
  renderParsedTable,
  updateParsedSection,
  requestCellError
}: RequestEditorProps) {
  const serverLabel = getSectionSideLabel(section, 'server');
  const clientLabel = getSectionSideLabel(section, 'client');
  const exampleLabel = isResponseSection(section) ? 'Пример ответа' : 'Пример запроса';

  return (
    <div className="stack">
      <label className="switch">
        <input
          type="checkbox"
          data-testid={`domain-model-toggle-${section.id}`}
          checked={Boolean(section.domainModelEnabled)}
          onChange={(e) =>
            updateParsedSection(section.id, (current) => {
              if (!isDualModelSection(current)) return current;
              if (e.target.checked) {
                return {
                  ...current,
                  domainModelEnabled: true,
                  clientFormat: current.clientFormat ?? 'json',
                  clientInput: current.clientInput ?? '',
                  clientRows: current.clientRows ?? [],
                  clientError: current.clientError ?? '',
                  clientMappings: current.clientMappings ?? {}
                };
              }

              return {
                ...current,
                domainModelEnabled: false,
                clientFormat: 'json',
                clientInput: '',
                clientRows: [],
                clientError: '',
                clientMappings: {}
              };
            })
          }
        />
        <span>Доменная модель</span>
      </label>

      {isRequestSection(section) && (
        <>
          <RequestMetaEditor
            section={section}
            target="server"
            isExpanderOpen={isExpanderOpen}
            setExpanderOpen={setExpanderOpen}
            getExternalSourceRows={getExternalSourceRows}
            getRequestHeaderRowsForEditor={getRequestHeaderRowsForEditor}
            updateParsedSection={updateParsedSection}
          />
          <RequestAuthEditor
            section={section}
            target="server"
            isExpanderOpen={isExpanderOpen}
            setExpanderOpen={setExpanderOpen}
            updateParsedSection={updateParsedSection}
          />
          <div className="stack">
            <div className="label">Headers</div>
            {renderRequestHeadersTable(section, 'server')}
          </div>
        </>
      )}

      <details
        className="expander"
        data-testid={`source-expander-${section.id}-server`}
        data-onboarding-anchor="prepare-source"
        open={isExpanderOpen(section.id, 'source-server')}
        onToggle={(e) => setExpanderOpen(section.id, 'source-server', e.currentTarget.open)}
      >
        <summary className="expander-summary">{serverLabel}</summary>
        <div className="expander-body">{renderSourceEditor(section, 'server', `${exampleLabel} (${serverLabel})`)}</div>
      </details>

      {section.domainModelEnabled && (
        <>
          {isRequestSection(section) && (
            <>
              <RequestMetaEditor
                section={section}
                target="client"
                isExpanderOpen={isExpanderOpen}
                setExpanderOpen={setExpanderOpen}
                getExternalSourceRows={getExternalSourceRows}
                getRequestHeaderRowsForEditor={getRequestHeaderRowsForEditor}
                updateParsedSection={updateParsedSection}
              />
              <RequestAuthEditor
                section={section}
                target="client"
                isExpanderOpen={isExpanderOpen}
                setExpanderOpen={setExpanderOpen}
                updateParsedSection={updateParsedSection}
              />
              <div className="stack">
                <div className="label">Внешние headers</div>
                {renderRequestHeadersTable(section, 'client')}
              </div>
            </>
          )}
          <details
            className="expander"
            data-testid={`source-expander-${section.id}-client`}
            open={isExpanderOpen(section.id, 'source-client')}
            onToggle={(e) => setExpanderOpen(section.id, 'source-client', e.currentTarget.open)}
          >
            <summary className="expander-summary">{clientLabel}</summary>
            <div className="expander-body">{renderSourceEditor(section, 'client', `${exampleLabel} (${clientLabel})`)}</div>
          </details>
        </>
      )}

      {section.error && <div className="alert error">{serverLabel}: {section.error}</div>}
      {section.clientError && <div className="alert error">{clientLabel}: {section.clientError}</div>}
      {requestCellError && <div className="alert error">{requestCellError}</div>}
      {renderParsedTable(section)}
    </div>
  );
}
