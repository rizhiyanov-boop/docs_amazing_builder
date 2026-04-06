import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import type { DocSection, MethodDocument } from '../types';

export type AddableBlockType = 'text' | 'request' | 'response' | 'error-logic' | 'diagram';

type MethodSectionSidebarProps = {
  enableMultiMethods: boolean;
  normalizedProjectName: string;
  editingProjectName: boolean;
  editingProjectNameDraft: string;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
  expandedProjectIds: Record<string, true>;
  expandedMethodId: string | null;
  methods: MethodDocument[];
  serverProjects: ReadonlyArray<{ id: string; name: string }>;
  currentProjectId: string | null;
  projectMethodCounts: Record<string, number>;
  projectMethodPreviews: Record<string, Array<{ id: string; name: string; sectionCount: number }>>;
  activeMethodId?: string;
  editingMethodId: string | null;
  editingMethodNameDraft: string;
  methodNameWarning: string;
  methodNameInputRef: RefObject<HTMLInputElement | null>;
  canDeleteMethod: boolean;
  sections: DocSection[];
  selectedSectionId?: string;
  validationMap: Map<string, string>;
  draggingId: string | null;
  isSectionPanelPulse: boolean;
  isAddEntityMenuOpen: boolean;
  isDeleteEntityMenuOpen: boolean;
  isProjectSwitching: boolean;
  switchingProjectId: string | null;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onStartProjectRename: () => void;
  onProjectNameDraftChange: (value: string) => void;
  onFinishProjectRename: () => void;
  onCancelProjectRename: () => void;
  onToggleProjectExpanded: (projectId: string) => void;
  onSwitchMethod: (method: MethodDocument) => void;
  onToggleMethodExpanded: (method: MethodDocument) => void;
  onStartMethodRename: (method: MethodDocument) => void;
  onMethodNameDraftChange: (value: string) => void;
  onFinishMethodRename: () => void;
  onCancelMethodRename: () => void;
  onCreateMethod: () => void;
  canDeleteProject: boolean;
  onDeleteActiveMethod: () => void;
  onRequestDeleteProject: () => void;
  onDragStartSection: (id: string) => void;
  onDropSection: (targetId: string) => void;
  onSelectSection: (id: string) => void;
  onToggleAddEntityMenu: () => void;
  onToggleDeleteEntityMenu: () => void;
  onStartSidebarResize: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  renderUiIcon: (name: string) => ReactNode;
  resolveSectionTitle: (title: string) => string;
};

export function MethodSectionSidebar({
  enableMultiMethods,
  normalizedProjectName,
  editingProjectName,
  editingProjectNameDraft,
  projectNameInputRef,
  expandedProjectIds,
  expandedMethodId,
  methods,
  serverProjects,
  currentProjectId,
  projectMethodCounts,
  projectMethodPreviews,
  activeMethodId,
  editingMethodId,
  editingMethodNameDraft,
  methodNameWarning,
  methodNameInputRef,
  canDeleteMethod,
  sections,
  selectedSectionId,
  validationMap,
  draggingId,
  isSectionPanelPulse,
  isAddEntityMenuOpen,
  isDeleteEntityMenuOpen,
  isProjectSwitching,
  switchingProjectId,
  onCreateProject,
  onSelectProject,
  onStartProjectRename,
  onProjectNameDraftChange,
  onFinishProjectRename,
  onCancelProjectRename,
  onToggleProjectExpanded,
  onSwitchMethod,
  onToggleMethodExpanded,
  onStartMethodRename,
  onMethodNameDraftChange,
  onFinishMethodRename,
  onCancelMethodRename,
  onCreateMethod,
  canDeleteProject,
  onDeleteActiveMethod,
  onRequestDeleteProject,
  onDragStartSection,
  onDropSection,
  onSelectSection,
  onToggleAddEntityMenu,
  onToggleDeleteEntityMenu,
  onStartSidebarResize,
  renderUiIcon,
  resolveSectionTitle
}: MethodSectionSidebarProps): ReactNode {
  const hasServerProjects = serverProjects.length > 0;
  const projectNodes: Array<{ id: string | null; name: string; methodCount?: number }> = hasServerProjects
    ? serverProjects.map((project) => ({
        id: project.id,
        name: project.name,
        methodCount: projectMethodCounts[project.id]
      }))
    : [
        {
          id: null,
          name: normalizedProjectName,
          methodCount: methods.length
        }
      ];

  return (
    <>
      <aside className="sidebar" role="region" aria-label={enableMultiMethods ? 'Методы и секции' : 'Секции'}>
        {enableMultiMethods && (
          <div className={`sidebar-panel method-panel nav-tree-panel ${isSectionPanelPulse ? 'section-panel-pulse' : ''}`}>
            <div className="project-list" role="tree" aria-label="Проекты, методы и секции">
              {projectNodes.map((projectNode) => {
                const isActiveProject = projectNode.id ? projectNode.id === currentProjectId : true;
                const isSwitchingThisProject = Boolean(projectNode.id) && switchingProjectId === projectNode.id;
                const isExpanded = projectNode.id ? Boolean(expandedProjectIds[projectNode.id]) : true;
                const projectFolderClassName = `project-folder ${isActiveProject ? 'active-project-folder' : 'project-folder-passive'}`;
                const readonlyMethods = projectNode.id ? (projectMethodPreviews[projectNode.id] ?? []) : [];

                return (
                  <div key={projectNode.id ?? 'local-active'} className={projectFolderClassName}>
                    <div
                      className={`project-folder-head ${isActiveProject ? 'active' : 'project-folder-head-passive'} ${isSwitchingThisProject ? 'is-loading' : ''}`}
                      role="treeitem"
                      aria-expanded={isExpanded}
                      tabIndex={0}
                      onClick={() => {
                        if (!projectNode.id || isActiveProject || isProjectSwitching) return;
                        onSelectProject(projectNode.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        if (!projectNode.id || isActiveProject || isProjectSwitching) return;
                        onSelectProject(projectNode.id);
                      }}
                    >
                      <span className="project-folder-name">
                        <span className="ui-icon" aria-hidden>{renderUiIcon('folder')}</span>
                        {editingProjectName ? (
                          <input
                            ref={projectNameInputRef}
                            className="inline-input project-name-input"
                            type="text"
                            value={editingProjectNameDraft}
                            onChange={(event) => onProjectNameDraftChange(event.target.value)}
                            onBlur={onFinishProjectRename}
                            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                onFinishProjectRename();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                onCancelProjectRename();
                              }
                            }}
                            placeholder="Название проекта"
                            aria-label="Название проекта"
                          />
                        ) : (
                          <span className="project-folder-title">{projectNode.name}</span>
                        )}
                      </span>
                      <span className="project-folder-meta">
                        {typeof projectNode.methodCount === 'number' && (
                          <span className="project-folder-count" aria-label={`Методов: ${projectNode.methodCount}`} title={`Методов: ${projectNode.methodCount}`}>
                            {projectNode.methodCount}
                          </span>
                        )}
                        {isSwitchingThisProject && (
                          <span className="project-loading-indicator" aria-label="Загрузка проекта" title="Загрузка проекта" />
                        )}
                        {isActiveProject && (
                          <button
                            type="button"
                            className="icon-button project-rename-btn"
                            aria-label="Переименовать проект"
                            title="Переименовать проект"
                            onClick={(event) => {
                              event.stopPropagation();
                              onStartProjectRename();
                            }}
                          >
                            <span className="ui-icon" aria-hidden>{renderUiIcon('edit')}</span>
                          </button>
                        )}
                        {projectNode.id && (
                          <button
                            type="button"
                            className="project-folder-toggle"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleProjectExpanded(projectNode.id as string);
                            }}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Свернуть проект' : 'Развернуть проект'}
                            title={isExpanded ? 'Свернуть проект' : 'Развернуть проект'}
                          >
                            <span className="ui-icon" aria-hidden>{renderUiIcon(isExpanded ? 'chevron_down' : 'chevron_right')}</span>
                          </button>
                        )}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="method-list project-folder-methods" role="group" aria-label="Методы проекта">
                        {isActiveProject ? (
                          methods.map((method) => {
                            const isActiveMethod = activeMethodId === method.id;
                            const isExpandedMethod = expandedMethodId === method.id;
                            return (
                              <div key={method.id} className="tree-method-node">
                                <div
                                  role="treeitem"
                                  aria-selected={isActiveMethod}
                                  aria-expanded={isExpandedMethod}
                                  tabIndex={0}
                                  className={`section-item method-item ${isActiveMethod ? 'active' : ''}`}
                                  onClick={() => onSwitchMethod(method)}
                                  onDoubleClick={() => onStartMethodRename(method)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      onSwitchMethod(method);
                                    }
                                  }}
                                >
                                  <div className="method-item-main">
                                    <button
                                      type="button"
                                      className="method-expand-toggle"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onToggleMethodExpanded(method);
                                      }}
                                      aria-label={isExpandedMethod ? `Свернуть разделы метода ${method.name}` : `Развернуть разделы метода ${method.name}`}
                                      aria-expanded={isExpandedMethod}
                                    >
                                      <span className="ui-icon method-node-icon" aria-hidden>{renderUiIcon(isExpandedMethod ? 'chevron_down' : 'chevron_right')}</span>
                                    </button>
                                    {editingMethodId === method.id && isActiveMethod ? (
                                      <input
                                        ref={methodNameInputRef}
                                        className="inline-input method-inline-input"
                                        type="text"
                                        value={editingMethodNameDraft}
                                        onChange={(event) => onMethodNameDraftChange(event.target.value)}
                                        onBlur={onFinishMethodRename}
                                        onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                                          if (event.key === 'Enter') {
                                            event.preventDefault();
                                            onFinishMethodRename();
                                          }
                                          if (event.key === 'Escape') {
                                            event.preventDefault();
                                            onCancelMethodRename();
                                          }
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                        placeholder="Название метода"
                                        aria-label="Название метода"
                                      />
                                    ) : (
                                      <div className="section-title method-title">{method.name}</div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    className="icon-button method-rename-btn"
                                    aria-label="Переименовать метод"
                                    title="Переименовать метод"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onStartMethodRename(method);
                                    }}
                                  >
                                    <span className="ui-icon" aria-hidden>{renderUiIcon('edit')}</span>
                                  </button>
                                </div>

                                {isExpandedMethod && (
                                  <div className="tree-section-list" role="group" aria-label={`Разделы метода ${method.name}`}>
                                    {sections.map((section) => {
                                      const error = validationMap.get(section.id);
                                      return (
                                        <div
                                          key={section.id}
                                          role="treeitem"
                                          aria-selected={selectedSectionId === section.id}
                                          aria-current={selectedSectionId === section.id ? 'true' : undefined}
                                          className={`section-item section-item-level ${selectedSectionId === section.id ? 'active' : ''} ${error ? 'warn' : ''} ${!section.enabled ? 'disabled' : ''}`}
                                          tabIndex={0}
                                          draggable
                                          onDragStart={() => onDragStartSection(section.id)}
                                          onDragOver={(event) => event.preventDefault()}
                                          onDrop={() => {
                                            if (draggingId) onDropSection(section.id);
                                          }}
                                          onClick={() => onSelectSection(section.id)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault();
                                              onSelectSection(section.id);
                                            }
                                          }}
                                        >
                                          <div className="section-item-main">
                                            <div className="section-title">{resolveSectionTitle(section.title)}</div>
                                            <div className="chips">
                                              {section.kind === 'parsed' && (
                                                <span className="chip">
                                                  {section.sectionType === 'request'
                                                    ? 'REQUEST'
                                                    : section.sectionType === 'response'
                                                      ? 'RESPONSE'
                                                      : section.format.toUpperCase()}
                                                </span>
                                              )}
                                              {section.kind === 'diagram' && <span className="chip">DIAGRAM</span>}
                                              {section.kind === 'errors' && <span className="chip">ERRORS</span>}
                                              {!section.enabled && <span className="chip muted">off</span>}
                                              {error && <span className="chip danger">err</span>}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {sections.length === 0 && (
                                      <div className="empty-state tree-empty-state">
                                        <div>У выбранного метода пока нет секций.</div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="empty-state tree-empty-state">
                            {readonlyMethods.length > 0 ? (
                              <div className="method-list project-folder-methods readonly-method-list" role="group" aria-label="Методы проекта">
                                {readonlyMethods.map((method) => (
                                  <div key={method.id} className="section-item method-item readonly-method-item" role="treeitem" aria-selected="false" tabIndex={-1}>
                                    <div className="section-item-main">
                                      <div className="section-title method-title">{method.name}</div>
                                      <div className="chips">
                                        <span className="chip muted">Секций: {method.sectionCount}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div>{isSwitchingThisProject ? 'Проект загружается...' : 'Содержимое подгружается...'}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="method-actions">
              <div className="add-block-menu add-entity-menu">
                <button className="ghost small topbar-action method-icon-btn" type="button" onClick={onToggleAddEntityMenu} aria-label="Добавить проект или метод" title="Добавить проект или метод" aria-expanded={isAddEntityMenuOpen}>
                  <span className="ui-icon" aria-hidden>{renderUiIcon('add_method')}</span>
                </button>
                {isAddEntityMenuOpen && (
                  <div className="add-block-popover add-entity-popover" role="menu" aria-label="Добавление сущностей">
                    <button
                      className="add-block-option"
                      type="button"
                      role="menuitem"
                      onClick={onCreateProject}
                    >
                      <span className="add-block-option-title">Новый проект</span>
                    </button>
                    <button
                      className="add-block-option"
                      type="button"
                      role="menuitem"
                      onClick={onCreateMethod}
                    >
                      <span className="add-block-option-title">Новый метод</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="add-block-menu delete-entity-menu">
                <button
                  className="ghost small topbar-action method-icon-btn"
                  type="button"
                  onClick={onToggleDeleteEntityMenu}
                  aria-label="Удалить проект или метод"
                  title="Удалить проект или метод"
                  aria-expanded={isDeleteEntityMenuOpen}
                >
                  <span className="ui-icon" aria-hidden>{renderUiIcon('delete_method')}</span>
                </button>
                {isDeleteEntityMenuOpen && (
                  <div className="add-block-popover add-entity-popover" role="menu" aria-label="Удаление сущностей">
                    <button
                      className="add-block-option"
                      type="button"
                      role="menuitem"
                      disabled={!canDeleteMethod}
                      onClick={onDeleteActiveMethod}
                    >
                      <span className="add-block-option-title">Удалить метод</span>
                    </button>
                    <button
                      className="add-block-option"
                      type="button"
                      role="menuitem"
                      disabled={!canDeleteProject}
                      onClick={onRequestDeleteProject}
                    >
                      <span className="add-block-option-title">Удалить проект</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            {methodNameWarning && <div className="method-warning">{methodNameWarning}</div>}
          </div>
        )}
      </aside>
      <button
        type="button"
        className="sidebar-resize-handle"
        onMouseDown={onStartSidebarResize}
        aria-label="Изменить ширину боковой панели"
        title="Изменить ширину боковой панели"
      />
    </>
  );
}
