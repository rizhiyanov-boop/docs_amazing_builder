import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DiagramEngine, MethodDocument, ProjectFlow, ProjectSection } from '../types';
import { MermaidLivePreview } from './MermaidLivePreview';
import { buildFlowMermaid } from '../flowDiagram';
import { getDiagramImageUrl } from '../diagramUtils';

type ProjectDocsEditorProps = {
  sections: ProjectSection[];
  activeSectionId: string | null;
  flows: ProjectFlow[];
  activeFlowId: string | null;
  methods: MethodDocument[];
  onSelectSection: (sectionId: string) => void;
  onSelectFlow: (flowId: string) => void;
  onOpenFlowsWorkspace: () => void;
  onCreateSection: (type: ProjectSection['type']) => void;
  onDeleteSection: (sectionId: string) => void;
  onMoveSection: (sectionId: string, direction: 'up' | 'down') => void;
  onUpdateSection: (sectionId: string, updater: (current: ProjectSection) => ProjectSection) => void;
};

const PROJECT_SECTION_TYPES: Array<{ value: ProjectSection['type']; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'note', label: 'Note' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'diagram', label: 'Диаграмма' }
];

const DEFAULT_PROJECT_DIAGRAM_CODE = 'graph LR\n  A[Start] --> B[End]';

function withProjectSectionType(section: ProjectSection, type: ProjectSection['type']): ProjectSection {
  if (type !== 'diagram') {
    return { ...section, type };
  }
  return {
    ...section,
    type,
    diagramEngine: section.diagramEngine ?? 'mermaid',
    diagramCode: section.diagramCode ?? DEFAULT_PROJECT_DIAGRAM_CODE
  };
}

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
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null;
  const activeFlow = flows.find((flow) => flow.id === activeFlowId) ?? flows[0] ?? null;
  const flowMermaid = buildFlowMermaid(activeFlow, methods);

  useEffect(() => {
    if (!isAddMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setIsAddMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAddMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isAddMenuOpen]);

  return (
    <div className="project-docs-layout">
      <aside className="project-docs-sidebar">
        <div className="project-docs-sidebar-head">
          <h3>Project Docs</h3>
          <div ref={addMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="small"
              aria-haspopup="menu"
              aria-expanded={isAddMenuOpen}
              onClick={() => setIsAddMenuOpen((current) => !current)}
            >
              + Секция
            </button>
            {isAddMenuOpen && (
              <div
                role="menu"
                aria-label="Project docs section type"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  zIndex: 100,
                  minWidth: 180,
                  background: 'var(--wb-bg-surface)',
                  border: '1px solid var(--wb-border)',
                  borderRadius: 'var(--wb-radius-lg)',
                  boxShadow: 'var(--wb-shadow-pop)',
                  overflow: 'hidden'
                }}
              >
                {PROJECT_SECTION_TYPES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onCreateSection(item.value);
                      setIsAddMenuOpen(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px 12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      color: 'var(--wb-text)',
                      textAlign: 'left',
                      fontFamily: 'var(--wb-font-sans)'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
                  onUpdateSection(activeSection.id, (current) => withProjectSectionType(current, event.target.value as ProjectSection['type']))
                }
              >
                {PROJECT_SECTION_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
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

            {activeSection.type === 'diagram' ? (
              <>
                <label className="field">
                  <div className="label">Движок диаграммы</div>
                  <select
                    value={activeSection.diagramEngine ?? 'mermaid'}
                    onChange={(event) =>
                      onUpdateSection(activeSection.id, (current) => ({
                        ...current,
                        diagramEngine: event.target.value as DiagramEngine
                      }))
                    }
                  >
                    <option value="mermaid">Mermaid</option>
                    <option value="plantuml">PlantUML</option>
                  </select>
                </label>

                <label className="field">
                  <div className="label">Код диаграммы</div>
                  <textarea
                    className="source-edit"
                    rows={10}
                    value={activeSection.diagramCode ?? ''}
                    onChange={(event) => onUpdateSection(activeSection.id, (current) => ({ ...current, diagramCode: event.target.value }))}
                    style={{ fontFamily: 'var(--wb-font-mono)', fontSize: 12.5 }}
                  />
                </label>

                <label className="field">
                  <div className="label">Подпись</div>
                  <textarea
                    className="source-edit"
                    rows={2}
                    value={activeSection.content}
                    onChange={(event) => onUpdateSection(activeSection.id, (current) => ({ ...current, content: event.target.value }))}
                  />
                </label>

                {(activeSection.diagramCode ?? '').trim() && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      border: '1px solid var(--wb-border-soft)',
                      borderRadius: 'var(--wb-radius)',
                      background: 'var(--wb-bg-soft)'
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--wb-text-muted)', marginBottom: 8 }}>ПРЕВЬЮ</div>
                    {(activeSection.diagramEngine ?? 'mermaid') === 'plantuml' ? (
                      <div className="diagram-preview">
                        <img
                          className="diagram-preview-image"
                          src={getDiagramImageUrl('plantuml', activeSection.diagramCode ?? '', 'svg')}
                          alt={activeSection.title || 'diagram'}
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <MermaidLivePreview code={activeSection.diagramCode ?? ''} />
                    )}
                  </div>
                )}
              </>
            ) : (
              <label className="field">
                <div className="label">Содержимое</div>
                <textarea
                  className="source-edit"
                  rows={12}
                  value={activeSection.content}
                  onChange={(event) => onUpdateSection(activeSection.id, (current) => ({ ...current, content: event.target.value }))}
                />
              </label>
            )}

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
