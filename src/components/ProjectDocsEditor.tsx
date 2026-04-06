import type { ReactNode } from 'react';
import type { MethodDocument, ProjectFlow, ProjectSection } from '../types';
import { MermaidLivePreview } from './MermaidLivePreview';
import { buildFlowMermaid } from '../flowDiagram';

type ProjectDocsEditorProps = {
  sections: ProjectSection[];
  activeSectionId: string | null;
  flows: ProjectFlow[];
  activeFlowId: string | null;
  methods: MethodDocument[];
  onSelectSection: (sectionId: string) => void;
  onSelectFlow: (flowId: string) => void;
  onOpenFlowsWorkspace: () => void;
  onCreateSection: () => void;
  onDeleteSection: (sectionId: string) => void;
  onMoveSection: (sectionId: string, direction: 'up' | 'down') => void;
  onUpdateSection: (sectionId: string, updater: (current: ProjectSection) => ProjectSection) => void;
};

export function ProjectDocsEditor({
  sections,
  activeSectionId,
  flows,
  activeFlowId,
  methods,
  onSelectSection,
  onSelectFlow,
  onOpenFlowsWorkspace,
  onCreateSection,
  onDeleteSection,
  onMoveSection,
  onUpdateSection
}: ProjectDocsEditorProps): ReactNode {
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null;
  const activeFlow = flows.find((flow) => flow.id === activeFlowId) ?? flows[0] ?? null;
  const flowMermaid = buildFlowMermaid(activeFlow, methods);

  return (
    <div className="project-docs-layout">
      <aside className="project-docs-sidebar">
        <div className="project-docs-sidebar-head">
          <h3>Project Docs</h3>
          <button type="button" className="small" onClick={onCreateSection}>+ Секция</button>
        </div>
        <div className="project-docs-list" role="list" aria-label="Секции проекта">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`project-docs-item ${activeSection?.id === section.id ? 'active' : ''}`}
              onClick={() => onSelectSection(section.id)}
            >
              <span className="project-docs-item-title">{section.title || 'Без названия'}</span>
              <span className="project-docs-item-type">{section.type}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="project-docs-editor panel">
        {activeSection ? (
          <div className="stack">
            <label className="field">
              <div className="label">Заголовок</div>
              <input
                value={activeSection.title}
                onChange={(event) => onUpdateSection(activeSection.id, (current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <label className="field">
              <div className="label">Тип</div>
              <select
                value={activeSection.type}
                onChange={(event) =>
                  onUpdateSection(activeSection.id, (current) => ({
                    ...current,
                    type: event.target.value as ProjectSection['type']
                  }))
                }
              >
                <option value="text">text</option>
                <option value="markdown">markdown</option>
                <option value="note">note</option>
                <option value="checklist">checklist</option>
              </select>
            </label>

            <label className="switch">
              <input
                type="checkbox"
                checked={activeSection.enabled}
                onChange={(event) => onUpdateSection(activeSection.id, (current) => ({ ...current, enabled: event.target.checked }))}
              />
              <span>Активна</span>
            </label>

            <label className="field">
              <div className="label">Содержимое</div>
              <textarea
                className="source-edit"
                rows={12}
                value={activeSection.content}
                onChange={(event) => onUpdateSection(activeSection.id, (current) => ({ ...current, content: event.target.value }))}
              />
            </label>

            <div className="row gap">
              <button type="button" className="ghost" onClick={() => onMoveSection(activeSection.id, 'up')}>Вверх</button>
              <button type="button" className="ghost" onClick={() => onMoveSection(activeSection.id, 'down')}>Вниз</button>
              <button type="button" className="danger" onClick={() => onDeleteSection(activeSection.id)}>Удалить</button>
            </div>

            <div className="project-docs-flow-preview panel">
              <div className="panel-head">
                <div className="panel-title">Схема процесса</div>
                <div className="row gap">
                  <select
                    value={activeFlow?.id ?? ''}
                    onChange={(event) => onSelectFlow(event.target.value)}
                  >
                    {flows.map((flow) => (
                      <option key={flow.id} value={flow.id}>{flow.name || 'Без названия'}</option>
                    ))}
                  </select>
                  <button type="button" className="ghost small" onClick={onOpenFlowsWorkspace}>Открыть во Flows</button>
                </div>
              </div>
              {activeFlow ? (
                <MermaidLivePreview code={flowMermaid} />
              ) : (
                <div className="empty-state">Добавьте flow, чтобы схема отображалась в Project Docs.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">Создайте секцию проектной документации.</div>
        )}
      </section>
    </div>
  );
}
