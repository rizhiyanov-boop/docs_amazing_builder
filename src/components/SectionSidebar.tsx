import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DocSection, MethodDocument } from '../types';

type AddableBlockType = 'text' | 'request' | 'response' | 'error-logic' | 'diagram';

type SectionSidebarProps = {
  enableMultiMethods: boolean;
  methods: MethodDocument[];
  activeMethod?: MethodDocument;
  switchMethod: (method: MethodDocument) => void;
  createMethod: () => void;
  deleteActiveMethod: () => void;
  methodNameInputRef: RefObject<HTMLInputElement | null>;
  updateActiveMethodName: (name: string) => void;
  normalizeActiveMethodName: () => void;
  methodNameWarning: string;
  isSectionPanelPulse: boolean;
  sections: DocSection[];
  validationMap: Map<string, string>;
  selectedSection?: DocSection;
  setDraggingId: (id: string | null) => void;
  draggingId: string | null;
  reorderSections: (sections: DocSection[], fromId: string, toId: string) => DocSection[];
  setSections: Dispatch<SetStateAction<DocSection[]>>;
  setSelectedId: (id: string) => void;
  resolveSectionTitle: (title: string) => string;
  addSectionByType: (type: AddableBlockType) => void;
  isAddBlockMenuOpen: boolean;
  setIsAddBlockMenuOpen: Dispatch<SetStateAction<boolean>>;
  addableBlockTypes: Array<{ type: AddableBlockType; label: string }>;
};

export function SectionSidebar({
  enableMultiMethods,
  methods,
  activeMethod,
  switchMethod,
  createMethod,
  deleteActiveMethod,
  methodNameInputRef,
  updateActiveMethodName,
  normalizeActiveMethodName,
  methodNameWarning,
  isSectionPanelPulse,
  sections,
  validationMap,
  selectedSection,
  setDraggingId,
  draggingId,
  reorderSections,
  setSections,
  setSelectedId,
  resolveSectionTitle,
  addSectionByType,
  isAddBlockMenuOpen,
  setIsAddBlockMenuOpen,
  addableBlockTypes
}: SectionSidebarProps) {
  return (
    <aside className="sidebar" role="region" aria-label={enableMultiMethods ? 'Методы и секции' : 'Секции'}>
      {enableMultiMethods && (
        <div className="sidebar-panel method-panel">
          <div className="sidebar-panel-head">
            <div className="muted">Методы</div>
          </div>
          <div className="method-list" role="listbox" aria-label="Список методов">
            {methods.map((method) => (
              <button
                key={method.id}
                type="button"
                data-testid={`method-item-${method.id}`}
                className={`section-item method-item ${activeMethod?.id === method.id ? 'active' : ''}`}
                onClick={() => switchMethod(method)}
              >
                <div className="section-title">{method.name}</div>
                <div className="chips">
                  <span className="chip">{method.sections.length} секц.</span>
                </div>
              </button>
            ))}
          </div>
          <div className="method-actions">
            <button className="ghost small" type="button" onClick={createMethod}>
              + Метод
            </button>
            <button className="ghost small" type="button" onClick={deleteActiveMethod} disabled={methods.length <= 1 || !activeMethod}>
              Удалить метод
            </button>
          </div>
          {activeMethod && (
            <input
              ref={methodNameInputRef}
              className="inline-input"
              type="text"
              value={activeMethod.name}
              onChange={(event) => updateActiveMethodName(event.target.value)}
              onBlur={normalizeActiveMethodName}
              placeholder="Название метода"
              aria-label="Название активного метода"
            />
          )}
          {methodNameWarning && <div className="method-warning">{methodNameWarning}</div>}
        </div>
      )}

      <div className={`sidebar-panel section-panel ${isSectionPanelPulse ? 'section-panel-pulse' : ''}`}>
        <div className="section-list-head">
          <div className="muted">Секции</div>
          <div className="context-pill context-pill-transition" aria-live="polite">
            {activeMethod ? activeMethod.name : 'Метод не выбран'}
          </div>
        </div>
        <div className="section-list">
          {sections.map((section) => {
            const error = validationMap.get(section.id);
            return (
              <button
                key={section.id}
                role="option"
                data-testid={`section-item-${section.id}`}
                aria-selected={selectedSection?.id === section.id}
                className={`section-item ${selectedSection?.id === section.id ? 'active' : ''} ${error ? 'warn' : ''} ${!section.enabled ? 'disabled' : ''}`}
                draggable
                onDragStart={() => setDraggingId(section.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingId) setSections((prev) => reorderSections(prev, draggingId, section.id));
                  setDraggingId(null);
                }}
                onClick={() => setSelectedId(section.id)}
              >
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
              </button>
            );
          })}
          {sections.length === 0 && (
            <div className="empty-state">
              <div>У выбранного метода пока нет секций.</div>
              <button className="ghost small" type="button" onClick={() => addSectionByType('text')}>
                + Добавить первую секцию
              </button>
            </div>
          )}
        </div>
        <div className="sidebar-footer">
          <div className="add-block-menu">
            <button className="ghost small" data-testid="add-section-button" type="button" onClick={() => setIsAddBlockMenuOpen((current) => !current)}>
              + Добавить секцию
            </button>
            {isAddBlockMenuOpen && (
              <div className="add-block-popover" role="menu" aria-label="Тип нового блока">
                {addableBlockTypes.map((item) => (
                  <button
                    key={item.type}
                    data-testid={`add-section-option-${item.type}`}
                    className="add-block-option"
                    type="button"
                    role="menuitem"
                    onClick={() => addSectionByType(item.type)}
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
  );
}
