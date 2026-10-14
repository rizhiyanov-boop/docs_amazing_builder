import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { WBButton } from './primitives/WorkbenchPrimitives';
import { WorkbenchIcon } from './workbench/WorkbenchIcon';
import { getPlantUmlImageUrl, resolveDiagramEngine } from '../diagramUtils';
import type { DiagramItem, DiagramSection } from '../types';
import { MermaidLivePreview } from './MermaidLivePreview';

type RichTextAction = 'bold' | 'italic' | 'code' | 'h3' | 'ul' | 'ol' | 'quote' | 'highlight';
type RichTextCommandOptions = {
  color?: string;
  language?: string;
};

type DiagramSectionEditorProps = {
  section: DiagramSection;
  defaultRichTextHighlight: string;
  isExpanderOpen: (sectionId: string, blockId: string) => boolean;
  setExpanderOpen: (sectionId: string, blockId: string, isOpen: boolean) => void;
  onAddDiagram: (sectionId: string) => void;
  onUpdateDiagram: (sectionId: string, diagramId: string, updater: (diagram: DiagramItem) => DiagramItem) => void;
  onDeleteDiagram: (sectionId: string, diagramId: string) => void;
  getDiagramEditorNode: (sectionId: string, diagramId: string) => HTMLDivElement | null;
  onBindDiagramEditorRef: (sectionId: string, diagramId: string, node: HTMLDivElement | null) => void;
  syncDiagramDescriptionFromEditor: (sectionId: string, diagramId: string) => void;
  rememberSelectionForEditor: (editor: HTMLElement | null) => void;
  applyDiagramTextCommand: (sectionId: string, diagramId: string, action: RichTextAction, options?: RichTextCommandOptions) => void;
  handleRichTextHotkeys: (event: ReactKeyboardEvent<HTMLElement>, execute: (action: RichTextAction) => void) => boolean;
};

export function DiagramSectionEditor({
  section,
  defaultRichTextHighlight,
  isExpanderOpen,
  setExpanderOpen,
  onAddDiagram,
  onUpdateDiagram,
  onDeleteDiagram,
  getDiagramEditorNode,
  onBindDiagramEditorRef,
  syncDiagramDescriptionFromEditor,
  rememberSelectionForEditor,
  applyDiagramTextCommand,
  handleRichTextHotkeys
}: DiagramSectionEditorProps): ReactNode {
  return (
    <div className="stack">
      <div className="row gap">
        <WBButton variant="ghost" size="sm" aria-label="+ Диаграмма" icon={<WorkbenchIcon name="plus" />} onClick={() => onAddDiagram(section.id)}>Диаграмма</WBButton>
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
                  {effectiveEngine === 'mermaid' && <MermaidLivePreview code={diagram.code} />}
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
                    onChange={(e) => onUpdateDiagram(section.id, diagram.id, (current) => ({ ...current, title: e.target.value }))}
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
                    onUpdateDiagram(section.id, diagram.id, (current) => ({
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
              {hasDiagramCode && effectiveEngine === 'mermaid' && <MermaidLivePreview code={diagram.code} />}
              {hasDiagramCode && effectiveEngine === 'plantuml' && (
                <div className="diagram-preview">
                  <img className="diagram-preview-image" src={getPlantUmlImageUrl(diagram.code, 'svg')} alt={title} loading="lazy" />
                </div>
              )}

              <div className="diagram-description-block">
                <div className="label">Текст под диаграммой</div>
                <div className="text-toolbar" role="toolbar" aria-label="Форматирование текста под диаграммой">
                  <div className="toolbar-group" aria-label="Базовое форматирование">
                    <button
                      className="ghost small toolbar-button"
                      type="button"
                      title="Жирный"
                      aria-label="Жирный"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'bold')}
                    >
                      <WorkbenchIcon name="bold" />
                    </button>
                    <button
                      className="ghost small toolbar-button"
                      type="button"
                      title="Код"
                      aria-label="Код"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'code')}
                    >
                      <WorkbenchIcon name="html" />
                    </button>
                    <button
                      className="ghost small toolbar-button"
                      type="button"
                      title="Выделение цветом"
                      aria-label="Выделение цветом"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const editor = getDiagramEditorNode(section.id, diagram.id);
                        rememberSelectionForEditor(editor);
                      }}
                      onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'highlight', { color: defaultRichTextHighlight })}
                    >
                      <WorkbenchIcon name="highlight" />
                    </button>
                  </div>
                  <div className="toolbar-group" aria-label="Структура текста">
                    <button
                      className="ghost small toolbar-button"
                      type="button"
                      title="Подзаголовок"
                      aria-label="Подзаголовок"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'h3')}
                    >
                      <WorkbenchIcon name="heading" />
                    </button>
                    <button
                      className="ghost small toolbar-button"
                      type="button"
                      title="Цитата"
                      aria-label="Цитата"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'quote')}
                    >
                      <WorkbenchIcon name="quote" />
                    </button>
                  </div>
                  <div className="toolbar-group" aria-label="Списки">
                    <button
                      className="ghost small toolbar-button"
                      type="button"
                      title="Маркированный список"
                      aria-label="Маркированный список"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'ul')}
                    >
                      <WorkbenchIcon name="list-bullet" />
                    </button>
                    <button
                      className="ghost small toolbar-button"
                      type="button"
                      title="Нумерованный список"
                      aria-label="Нумерованный список"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyDiagramTextCommand(section.id, diagram.id, 'ol')}
                    >
                      <WorkbenchIcon name="list-number" />
                    </button>
                  </div>
                </div>

                <div
                  ref={(node) => {
                    onBindDiagramEditorRef(section.id, diagram.id, node);
                  }}
                  className="rich-text-editor"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => syncDiagramDescriptionFromEditor(section.id, diagram.id)}
                  onMouseUp={() => rememberSelectionForEditor(getDiagramEditorNode(section.id, diagram.id))}
                  onKeyUp={() => rememberSelectionForEditor(getDiagramEditorNode(section.id, diagram.id))}
                  onKeyDown={(event) => {
                    const editor = getDiagramEditorNode(section.id, diagram.id);
                    if (!editor) return;

                    const handled = handleRichTextHotkeys(event, (action) => {
                      rememberSelectionForEditor(editor);
                      applyDiagramTextCommand(section.id, diagram.id, action);
                    });

                    if (handled) return;
                  }}
                />
              </div>

              <div className="row gap">
                <WBButton variant="danger" size="sm" icon={<WorkbenchIcon name="trash" />} onClick={() => onDeleteDiagram(section.id, diagram.id)}>Удалить диаграмму</WBButton>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
