import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import type { DocSection, MethodDocument } from '../types';

export type AddableBlockType = 'text' | 'request' | 'response' | 'error-logic' | 'diagram';

type MethodSectionSidebarProps = {
  enableMultiMethods: boolean;
  normalizedProjectName: string;
  editingProjectName: boolean;
  editingProjectNameDraft: string;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
  isProjectFolderExpanded: boolean;
  methods: MethodDocument[];
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
  isAddBlockMenuOpen: boolean;
  addableBlockTypes: ReadonlyArray<{ type: AddableBlockType; label: string }>;
  onStartProjectRename: () => void;
  onProjectNameDraftChange: (value: string) => void;
  onFinishProjectRename: () => void;
  onCancelProjectRename: () => void;
  onToggleProjectFolder: () => void;
  onSwitchMethod: (method: MethodDocument) => void;
  onStartMethodRename: (method: MethodDocument) => void;
  onMethodNameDraftChange: (value: string) => void;
  onFinishMethodRename: () => void;
  onCancelMethodRename: () => void;
  onCreateMethod: () => void;
  onDeleteActiveMethod: () => void;
  onDragStartSection: (id: string) => void;
  onDropSection: (targetId: string) => void;
  onSelectSection: (id: string) => void;
  onToggleAddBlockMenu: () => void;
  onAddSectionByType: (type: AddableBlockType) => void;
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
  isProjectFolderExpanded,
  methods,
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
  isAddBlockMenuOpen,
  addableBlockTypes,
  onStartProjectRename,
  onProjectNameDraftChange,
  onFinishProjectRename,
  onCancelProjectRename,
  onToggleProjectFolder,
  onSwitchMethod,
  onStartMethodRename,
  onMethodNameDraftChange,
  onFinishMethodRename,
  onCancelMethodRename,
  onCreateMethod,
  onDeleteActiveMethod,
  onDragStartSection,
  onDropSection,
  onSelectSection,
  onToggleAddBlockMenu,
  onAddSectionByType,
  onStartSidebarResize,
  renderUiIcon,
  resolveSectionTitle
}: MethodSectionSidebarProps): ReactNode {
  return (
    <>
      <aside className="sidebar" role="region" aria-label={enableMultiMethods ? 'Методы и секции' : 'Секции'}>
        {enableMultiMethods && (
          <div className="sidebar-panel method-panel">
            <div className="project-folder" role="tree" aria-label="Проект и методы">
              <div className="project-folder-head">
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
                    <span className="project-folder-title">{normalizedProjectName}</span>
                  )}
                </span>
                <span className="project-folder-meta">
                  <button
                    type="button"
                    className="icon-button project-rename-btn"
                    aria-label="Переименовать проект"
                    title="Переименовать проект"
                    onClick={onStartProjectRename}
                  >
                    <span className="ui-icon" aria-hidden>{renderUiIcon('edit')}</span>
                  </button>
                  <button
                    type="button"
                    className="project-folder-toggle"
                    onClick={onToggleProjectFolder}
                    aria-expanded={isProjectFolderExpanded}
                    aria-label={isProjectFolderExpanded ? 'Свернуть список методов' : 'Развернуть список методов'}
                    title={isProjectFolderExpanded ? 'Свернуть список методов' : 'Развернуть список методов'}
                  >
                    <span className="ui-icon" aria-hidden>{renderUiIcon(isProjectFolderExpanded ? 'chevron_down' : 'chevron_right')}</span>
                  </button>
                </span>
              </div>
            </div>
            {isProjectFolderExpanded && (
              <div className="method-list project-folder-methods" role="listbox" aria-label="Список методов">
                {methods.map((method) => (
                  <div
                    key={method.id}
                    role="option"
                    aria-selected={activeMethodId === method.id}
                    tabIndex={0}
                    className={`section-item method-item ${activeMethodId === method.id ? 'active' : ''}`}
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
                      {editingMethodId === method.id && activeMethodId === method.id ? (
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
                ))}
              </div>
            )}
            <div className="method-actions">
              <button className="ghost small topbar-action method-icon-btn" type="button" onClick={onCreateMethod} aria-label="Добавить метод" title="Добавить метод">
                <span className="ui-icon" aria-hidden>{renderUiIcon('add_method')}</span>
              </button>
              <button className="ghost small topbar-action method-icon-btn" type="button" onClick={onDeleteActiveMethod} disabled={!canDeleteMethod} aria-label="Удалить метод" title="Удалить метод">
                <span className="ui-icon" aria-hidden>{renderUiIcon('delete_method')}</span>
              </button>
            </div>
            {methodNameWarning && <div className="method-warning">{methodNameWarning}</div>}
          </div>
        )}

        <div className={`sidebar-panel section-panel ${isSectionPanelPulse ? 'section-panel-pulse' : ''}`}>
          <div className="section-list-head">
            <div className="muted">Секции</div>
          </div>
          <div className="section-list">
            {sections.map((section) => {
              const error = validationMap.get(section.id);
              return (
                <div
                  key={section.id}
                  role="option"
                  aria-selected={selectedSectionId === section.id}
                  className={`section-item ${selectedSectionId === section.id ? 'active' : ''} ${error ? 'warn' : ''} ${!section.enabled ? 'disabled' : ''}`}
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
              <div className="empty-state">
                <div>У выбранного метода пока нет секций.</div>
                <button className="ghost small" type="button" onClick={() => onAddSectionByType('text')} aria-label="Добавить первую секцию" title="Добавить первую секцию">
                  <span className="ui-icon" aria-hidden>{renderUiIcon('add_section')}</span>
                </button>
              </div>
            )}
          </div>
          <div className="sidebar-footer">
            <div className="add-block-menu">
              <button className="ghost small topbar-action" type="button" onClick={onToggleAddBlockMenu} aria-label="Добавить секцию" title="Добавить секцию">
                <span className="ui-icon" aria-hidden>{renderUiIcon('add_section')}</span>
              </button>
              {isAddBlockMenuOpen && (
                <div className="add-block-popover" role="menu" aria-label="Тип нового блока">
                  {addableBlockTypes.map((item) => (
                    <button
                      key={item.type}
                      className="add-block-option"
                      type="button"
                      role="menuitem"
                      onClick={() => onAddSectionByType(item.type)}
                    >
                      <span className="add-block-option-title">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
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
