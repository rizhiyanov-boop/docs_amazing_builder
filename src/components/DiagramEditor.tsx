import type { ReactNode } from 'react';
import { getPlantUmlImageUrl, resolveDiagramEngine } from '../diagramUtils';
import type { DiagramSection } from '../types';

type RichTextAction = 'bold' | 'italic' | 'code' | 'h3' | 'ul' | 'ol' | 'quote' | 'highlight' | 'code-block';

type DiagramEditorProps = {
  section: DiagramSection;
  selectedHighlightColor: string;
  selectedCodeLanguage: string;
  addDiagram: (sectionId: string) => void;
  updateDiagram: (sectionId: string, diagramId: string, updater: (diagram: DiagramSection['diagrams'][number]) => DiagramSection['diagrams'][number]) => void;
  deleteDiagram: (sectionId: string, diagramId: string) => void;
  isExpanderOpen: (sectionId: string, blockId: string) => boolean;
  setExpanderOpen: (sectionId: string, blockId: string, isOpen: boolean) => void;
  setDiagramTextRef: (sectionId: string, diagramId: string, node: HTMLDivElement | null) => void;
  getDiagramTextEditor: (sectionId: string, diagramId: string) => HTMLDivElement | null;
  syncDiagramDescriptionFromEditor: (sectionId: string, diagramId: string) => void;
  applyDiagramTextCommand: (sectionId: string, diagramId: string, action: RichTextAction, options?: { color?: string; language?: string }) => void;
  rememberSelectionForEditor: (editor: HTMLElement | null) => void;
  pickHighlightColor: (currentColor: string) => string | null;
  pickCodeLanguage: (currentLanguage: string) => string | null;
  setSelectedHighlightColor: (value: string) => void;
  setSelectedCodeLanguage: (value: string) => void;
  MermaidPreview: ({ code }: { code: string }) => ReactNode;
};

export function DiagramEditor({
  section,
  selectedHighlightColor,
  selectedCodeLanguage,
  addDiagram,
  updateDiagram,
  deleteDiagram,
  isExpanderOpen,
  setExpanderOpen,
  setDiagramTextRef,
  getDiagramTextEditor,
  syncDiagramDescriptionFromEditor,
  applyDiagramTextCommand,
  rememberSelectionForEditor,
  pickHighlightColor,
  pickCodeLanguage,
  setSelectedHighlightColor,
  setSelectedCodeLanguage,
  MermaidPreview
}: DiagramEditorProps) {
  return (
    <div className="stack">
      <div className="row gap">
        <button className="ghost small" type="button" onClick={() => addDiagram(section.id)}>
          + Диаграмма
        </button>
      </div>

      {section.diagrams.map((diagram, index) => {
        const blockId = `diagram-item-${diagram.id}`;
        const title = diagram.title.trim() || `Диаграмма ${index + 1}`;
        const effectiveEngine = resolveDiagramEngine(diagram.code, diagram.engine);
        const isOpen = isExpanderOpen(section.id, blockId);
        const hasDiagramCode = Boolean(diagram.code.trim());

        return (
          <details
            key={diagram.id}
            className="expander"
            open={isOpen}
            onToggle={(e) => setExpanderOpen(section.id, blockId, e.currentTarget.open)}
          >
            <summary className={`expander-summary ${!isOpen && hasDiagramCode ? 'with-diagram-preview' : ''}`}>
              <span className="expander-summary-title">{title}</span>
              {!isOpen && hasDiagramCode && (
                <span className="diagram-collapsed-preview">
                  {effectiveEngine === 'mermaid' && <>{MermaidPreview({ code: diagram.code })}</>}
                  {effectiveEngine === 'plantuml' && (
                    <span className="diagram-preview">
                      <img className="diagram-preview-image" src={getPlantUmlImageUrl(diagram.code, 'svg')} alt={title} loading="lazy" />
                    </span>
                  )}
                </span>
              )}
            </summary>
            <div className="expander-body">
              <div className="diagram-header-row">
                <label className="field">
                  <div className="label">Название</div>
                  <input
                    type="text"
                    value={diagram.title}
                    onChange={(e) => updateDiagram(section.id, diagram.id, (current) => ({ ...current, title: e.target.value }))}
                    placeholder="Например: Общий процесс"
                  />
                </label>
                <div className="badge">{effectiveEngine === 'plantuml' ? 'PLANTUML (AUTO)' : 'MERMAID (AUTO)'}</div>
              </div>

              <label className="field">
                <div className="label">Код диаграммы</div>
                <textarea
                  className="source-edit"
                  rows={10}
                  value={diagram.code}
                  onChange={(e) =>
                    updateDiagram(section.id, diagram.id, (current) => ({
                      ...current,
                      code: e.target.value,
                      engine: resolveDiagramEngine(e.target.value, current.engine)
                    }))
                  }
                  placeholder={effectiveEngine === 'mermaid' ? 'sequenceDiagram\nA->>B: Hello' : '@startuml\nAlice -> Bob: Hello\n@enduml'}
                />
              </label>

              <div className="label">Предпросмотр</div>
              {!hasDiagramCode && <div className="muted">Вставьте код диаграммы для предпросмотра</div>}
              {hasDiagramCode && effectiveEngine === 'mermaid' && <>{MermaidPreview({ code: diagram.code })}</>}
              {hasDiagramCode && effectiveEngine === 'plantuml' && (
                <div className="diagram-preview">
                  <img className="diagram-preview-image" src={getPlantUmlImageUrl(diagram.code, 'svg')} alt={title} loading="lazy" />
                </div>
              )}

              <div className="diagram-description-block">
                <div className="label">Текст под диаграммой</div>
                <div className="text-toolbar" role="toolbar" aria-label="Форматирование текста под диаграммой">
                  <div className="toolbar-group" aria-label="Базовое форматирование">
                    <button className="ghost small toolbar-button" type="button" title="Жирный" aria-label="Жирный" onMouseDown={(event) => event.preventDefault()} onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'bold')}>
                      <span className="toolbar-icon toolbar-icon-bold">B</span>
                    </button>
                    <button className="ghost small toolbar-button" type="button" title="Курсив" aria-label="Курсив" onMouseDown={(event) => event.preventDefault()} onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'italic')}>
                      <span className="toolbar-icon toolbar-icon-italic">I</span>
                    </button>
                    <button className="ghost small toolbar-button" type="button" title="Код" aria-label="Код" onMouseDown={(event) => event.preventDefault()} onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'code')}>
                      <span className="toolbar-icon">&lt;/&gt;</span>
                    </button>
                    <button
                      className="ghost small toolbar-button"
                      type="button"
                      title="Выделение цветом"
                      aria-label="Выделение цветом"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const editor = getDiagramTextEditor(section.id, diagram.id);
                        rememberSelectionForEditor(editor);
                      }}
                      onClick={() => {
                        const nextColor = pickHighlightColor(selectedHighlightColor);
                        if (!nextColor) return;
                        setSelectedHighlightColor(nextColor);
                        applyDiagramTextCommand(section.id, diagram.id, 'highlight', { color: nextColor });
                      }}
                    >
                      <span className="toolbar-icon">🖍</span>
                    </button>
                  </div>
                  <div className="toolbar-group" aria-label="Структура текста">
                    <button className="ghost small toolbar-button" type="button" title="Подзаголовок" aria-label="Подзаголовок" onMouseDown={(event) => event.preventDefault()} onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'h3')}>
                      <span className="toolbar-heading-glyph" aria-hidden="true">
                        <span className="toolbar-heading-main">T</span>
                        <span className="toolbar-heading-level">3</span>
                      </span>
                    </button>
                    <button className="ghost small toolbar-button" type="button" title="Цитата" aria-label="Цитата" onMouseDown={(event) => event.preventDefault()} onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'quote')}>
                      <span className="toolbar-icon">❝</span>
                    </button>
                  </div>
                  <div className="toolbar-group" aria-label="Списки">
                    <button className="ghost small toolbar-button" type="button" title="Маркированный список" aria-label="Маркированный список" onMouseDown={(event) => event.preventDefault()} onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'ul')}>
                      <span className="toolbar-icon">•</span>
                    </button>
                    <button className="ghost small toolbar-button" type="button" title="Нумерованный список" aria-label="Нумерованный список" onMouseDown={(event) => event.preventDefault()} onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'ol')}>
                      <span className="toolbar-icon">1.</span>
                    </button>
                  </div>
                  <div className="toolbar-group toolbar-group-controls" aria-label="Кодовые блоки">
                    <button
                      className="ghost small toolbar-button toolbar-button-wide"
                      type="button"
                      title="Вставить блок кода"
                      aria-label="Вставить блок кода"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const editor = getDiagramTextEditor(section.id, diagram.id);
                        rememberSelectionForEditor(editor);
                      }}
                      onClick={() => {
                        const nextLanguage = pickCodeLanguage(selectedCodeLanguage);
                        if (!nextLanguage) return;
                        setSelectedCodeLanguage(nextLanguage);
                        applyDiagramTextCommand(section.id, diagram.id, 'code-block', { language: nextLanguage });
                      }}
                    >
                      <span className="toolbar-icon">{`{ }`}</span>
                    </button>
                  </div>
                </div>

                <div
                  ref={(node) => setDiagramTextRef(section.id, diagram.id, node)}
                  className="rich-text-editor"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => syncDiagramDescriptionFromEditor(section.id, diagram.id)}
                />
              </div>

              <div className="row gap">
                <button className="ghost small" type="button" onClick={() => deleteDiagram(section.id, diagram.id)}>
                  Удалить диаграмму
                </button>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
