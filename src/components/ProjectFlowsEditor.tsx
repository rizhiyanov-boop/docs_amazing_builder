import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import type { FlowEdge, FlowNode, MethodDocument, ParamMapping, ProjectFlow } from '../types';
import type { FlowIssue } from '../flowValidation';
import { autoLayoutFlow } from '../flowDiagram';

type ProjectFlowsEditorProps = {
  methods: MethodDocument[];
  flows: ProjectFlow[];
  activeFlowId: string | null;
  issues: FlowIssue[];
  onCreateFlow: () => void;
  onDeleteFlow: (flowId: string) => void;
  onSelectFlow: (flowId: string) => void;
  onUpdateFlow: (flowId: string, updater: (current: ProjectFlow) => ProjectFlow) => void;
};

function createNodeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createEdgeId(): string {
  return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createMappingId(): string {
  return `map-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clampCanvas(value: number): number {
  return Math.min(2000, Math.max(20, value));
}

export function ProjectFlowsEditor({
  methods,
  flows,
  activeFlowId,
  issues,
  onCreateFlow,
  onDeleteFlow,
  onSelectFlow,
  onUpdateFlow
}: ProjectFlowsEditorProps): ReactNode {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectFromNodeId, setConnectFromNodeId] = useState<string | null>(null);
  const [dragNodeState, setDragNodeState] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'flow' | 'narrative'>('flow');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [edgeDraft, setEdgeDraft] = useState<{ fromNodeId: string; toNodeId: string }>({ fromNodeId: '', toNodeId: '' });

  const activeFlow = flows.find((flow) => flow.id === activeFlowId) ?? flows[0] ?? null;
  const selectedNode = activeFlow?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = activeFlow?.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const methodById = new Map(methods.map((method) => [method.id, method]));

  const effectiveEdgeDraft = (() => {
    if (!activeFlow) return edgeDraft;
    const nonNoteNodes = activeFlow.nodes.filter((node) => node.type !== 'note');
    const fallbackFrom = nonNoteNodes[0]?.id ?? '';
    const fallbackTo = nonNoteNodes[1]?.id ?? nonNoteNodes[0]?.id ?? '';
    const fromExists = edgeDraft.fromNodeId && activeFlow.nodes.some((node) => node.id === edgeDraft.fromNodeId);
    const toExists = edgeDraft.toNodeId && activeFlow.nodes.some((node) => node.id === edgeDraft.toNodeId);
    return {
      fromNodeId: fromExists ? edgeDraft.fromNodeId : fallbackFrom,
      toNodeId: toExists ? edgeDraft.toNodeId : fallbackTo
    };
  })();

  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  function mutateActiveFlow(updater: (current: ProjectFlow) => ProjectFlow): void {
    if (!activeFlow) return;
    onUpdateFlow(activeFlow.id, updater);
  }

  function upsertEdge(fromNodeId: string, toNodeId: string): void {
    if (!activeFlow) return;
    if (fromNodeId === toNodeId) return;
    mutateActiveFlow((current) => {
      const exists = current.edges.some((edge) => edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId);
      if (exists) return current;
      return {
        ...current,
        updatedAt: new Date().toISOString(),
        edges: [
          ...current.edges,
          {
            id: createEdgeId(),
            type: 'sequence',
            fromNodeId,
            toNodeId,
            mappings: []
          }
        ]
      };
    });
  }

  function deleteEdge(edgeId: string): void {
    if (!activeFlow) return;
    mutateActiveFlow((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      edges: current.edges.filter((edge) => edge.id !== edgeId)
    }));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
  }

  function addNode(type: FlowNode['type'], methodId?: string): void {
    mutateActiveFlow((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      nodes: [
        ...current.nodes,
        {
          id: createNodeId(type),
          type,
          position: {
            x: 80 + current.nodes.length * 24,
            y: 80 + current.nodes.length * 20
          },
          label:
            type === 'method'
              ? (methodById.get(methodId || '')?.name ?? 'Method')
              : type === 'start'
                ? 'Start'
                : type === 'end'
                  ? 'End'
                  : 'Note',
          methodRef: type === 'method' && methodId ? { methodId } : undefined,
          noteContent: type === 'note' ? 'Комментарий...' : undefined
        }
      ]
    }));
  }

  function deleteNode(nodeId: string): void {
    mutateActiveFlow((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      nodes: current.nodes.filter((node) => node.id !== nodeId),
      edges: current.edges.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId)
    }));
    setSelectedNodeId(null);
    if (connectFromNodeId === nodeId) setConnectFromNodeId(null);
  }

  function selectNode(nodeId: string): void {
    if (connectFromNodeId && connectFromNodeId !== nodeId && activeFlow) {
      upsertEdge(connectFromNodeId, nodeId);
      setConnectFromNodeId(null);
      setSelectedNodeId(nodeId);
      return;
    }
    setSelectedEdgeId(null);
    setSelectedNodeId(nodeId);
  }

  function updateSelectedNode(updater: (node: FlowNode) => FlowNode): void {
    if (!selectedNode || !activeFlow) return;
    mutateActiveFlow((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      nodes: current.nodes.map((node) => (node.id === selectedNode.id ? updater(node) : node))
    }));
  }

  function updateSelectedEdge(updater: (edge: FlowEdge) => FlowEdge): void {
    if (!selectedEdge || !activeFlow) return;
    mutateActiveFlow((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      edges: current.edges.map((edge) => (edge.id === selectedEdge.id ? updater(edge) : edge))
    }));
  }

  function onNodeMouseDown(event: ReactMouseEvent<HTMLDivElement>, node: FlowNode): void {
    if (viewMode !== 'flow') return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, select, option')) return;
    event.preventDefault();
    setDragNodeState({
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originalX: node.position.x,
      originalY: node.position.y
    });
  }

  function onCanvasMouseMove(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!dragNodeState || !activeFlow) return;
    const deltaX = event.clientX - dragNodeState.startX;
    const deltaY = event.clientY - dragNodeState.startY;
    mutateActiveFlow((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== dragNodeState.nodeId) return node;
        return {
          ...node,
          position: {
            x: clampCanvas(dragNodeState.originalX + deltaX),
            y: clampCanvas(dragNodeState.originalY + deltaY)
          }
        };
      })
    }));
  }

  function onCanvasMouseUp(): void {
    if (!dragNodeState) return;
    setDragNodeState(null);
  }

  function addMapping(): void {
    updateSelectedEdge((edge) => ({
      ...edge,
      mappings: [
        ...(edge.mappings ?? []),
        {
          id: createMappingId(),
          source: { nodeId: edge.fromNodeId, side: 'response' },
          target: { nodeId: edge.toNodeId, side: 'request' }
        }
      ]
    }));
  }

  function updateMapping(mappingId: string, updater: (mapping: ParamMapping) => ParamMapping): void {
    updateSelectedEdge((edge) => ({
      ...edge,
      mappings: (edge.mappings ?? []).map((mapping) => (mapping.id === mappingId ? updater(mapping) : mapping))
    }));
  }

  function removeMapping(mappingId: string): void {
    updateSelectedEdge((edge) => ({
      ...edge,
      mappings: (edge.mappings ?? []).filter((mapping) => mapping.id !== mappingId)
    }));
  }

  function createEdgeFromDraft(): void {
    if (!effectiveEdgeDraft.fromNodeId || !effectiveEdgeDraft.toNodeId) return;
    upsertEdge(effectiveEdgeDraft.fromNodeId, effectiveEdgeDraft.toNodeId);
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
  }

  function alignCurrentFlow(): void {
    if (!activeFlow) return;
    mutateActiveFlow((current) => autoLayoutFlow(current));
  }

  const edgesWithCoordinates = (activeFlow?.edges ?? []).map((edge) => {
    const fromNode = activeFlow?.nodes.find((node) => node.id === edge.fromNodeId);
    const toNode = activeFlow?.nodes.find((node) => node.id === edge.toNodeId);
    return {
      edge,
      fromNode,
      toNode
    };
  });

  return (
    <div className={`flows-layout ${isFullscreen ? 'fullscreen' : ''}`}>
      <aside className="flows-list-panel">
        <div className="flows-panel-head">
          <h3>Flows</h3>
          <button type="button" className="small" onClick={onCreateFlow}>+ Flow</button>
        </div>
        <div className="flows-list">
          {flows.map((flow) => (
            <button
              key={flow.id}
              type="button"
              className={`flows-list-item ${activeFlow?.id === flow.id ? 'active' : ''}`}
              onClick={() => {
                onSelectFlow(flow.id);
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
            >
              <span>{flow.name || 'Без названия'}</span>
              <span className="chip muted">{flow.nodes.length} узлов</span>
            </button>
          ))}
        </div>
        {activeFlow && (
          <button type="button" className="danger" onClick={() => onDeleteFlow(activeFlow.id)}>
            Удалить flow
          </button>
        )}
      </aside>

      <section className="flows-main panel">
        {activeFlow ? (
          <div className="stack">
            <div className="flow-toolbar">
              <input
                value={activeFlow.name}
                onChange={(event) =>
                  mutateActiveFlow((current) => ({
                    ...current,
                    name: event.target.value,
                    updatedAt: new Date().toISOString()
                  }))
                }
                placeholder="Название flow"
              />
              <button type="button" className={viewMode === 'flow' ? 'small primary' : 'small'} onClick={() => setViewMode('flow')}>Flow</button>
              <button type="button" className={viewMode === 'narrative' ? 'small primary' : 'small'} onClick={() => setViewMode('narrative')}>Narrative</button>
              <button type="button" className="small" onClick={alignCurrentFlow}>Выравнять схему</button>
              <button type="button" className="small ghost" onClick={() => setIsFullscreen((current) => !current)}>
                {isFullscreen ? 'Свернуть' : 'На весь экран'}
              </button>
            </div>

            {viewMode === 'flow' ? (
              <div className="flows-workspace">
                <aside className="flows-library">
                  <div className="label">Library</div>
                  <div className="stack">
                    <button type="button" className="ghost" onClick={() => addNode('start')}>+ Start</button>
                    <button type="button" className="ghost" onClick={() => addNode('end')}>+ End</button>
                    <button type="button" className="ghost" onClick={() => addNode('note')}>+ Note</button>
                  </div>
                  <div className="label">Methods</div>
                  <div className="flows-method-picker">
                    {methods.map((method) => (
                      <button key={method.id} type="button" className="ghost" onClick={() => addNode('method', method.id)}>
                        {method.name}
                      </button>
                    ))}
                  </div>
                </aside>

                <div className="flow-canvas-wrap">
                  <div
                    className="flow-canvas"
                    onMouseMove={onCanvasMouseMove}
                    onMouseUp={onCanvasMouseUp}
                    onMouseLeave={onCanvasMouseUp}
                    onClick={() => {
                      if (!dragNodeState) {
                        setSelectedEdgeId(null);
                        setSelectedNodeId(null);
                      }
                    }}
                  >
                    <svg className="flow-edge-layer">
                      {edgesWithCoordinates.map(({ edge, fromNode, toNode }) => {
                        if (!fromNode || !toNode) return null;
                        const x1 = fromNode.position.x + 90;
                        const y1 = fromNode.position.y + 24;
                        const x2 = toNode.position.x + 90;
                        const y2 = toNode.position.y + 24;
                        return (
                          <g key={edge.id}>
                            <path
                              d={`M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 - 60} ${y2}, ${x2} ${y2}`}
                              className={`flow-edge ${selectedEdge?.id === edge.id ? 'active' : ''}`}
                              onClick={() => {
                                setSelectedNodeId(null);
                                setSelectedEdgeId(edge.id);
                              }}
                            />
                            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} className="flow-edge-label">
                              {(edge.mappings ?? []).length > 0 ? `${(edge.mappings ?? []).length} maps` : ''}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                    {activeFlow.nodes.map((node) => (
                      <div
                        key={node.id}
                        className={`flow-node ${node.type} ${selectedNode?.id === node.id ? 'active' : ''} ${connectFromNodeId === node.id ? 'connect-from' : ''}`}
                        style={{ left: node.position.x, top: node.position.y }}
                        onMouseDown={(event) => onNodeMouseDown(event, node)}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectNode(node.id);
                        }}
                      >
                        <div className="flow-node-head">
                          <span className="flow-node-type">{node.type.toUpperCase()}</span>
                          <button
                            type="button"
                            className={connectFromNodeId === node.id ? 'small primary' : 'small ghost'}
                            onClick={(event) => {
                              event.stopPropagation();
                              setConnectFromNodeId((current) => (current === node.id ? null : node.id));
                              setSelectedEdgeId(null);
                              setSelectedNodeId(node.id);
                            }}
                            title="Соединить с другим узлом"
                          >
                            {connectFromNodeId === node.id ? 'Отмена' : 'Connect'}
                          </button>
                        </div>
                        <div className="flow-node-title">{node.label || 'Узел'}</div>
                        {node.type === 'method' && <div className="flow-node-sub">{methodById.get(node.methodRef?.methodId ?? '')?.name ?? 'Метод удалён'}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <aside className="flows-inspector">
                  <div className="label">Inspector</div>
                  <div className="flow-link-builder">
                    <div className="label">Связать узлы (надежный режим)</div>
                    <select
                      value={effectiveEdgeDraft.fromNodeId}
                      onChange={(event) => setEdgeDraft((current) => ({ ...current, fromNodeId: event.target.value }))}
                    >
                      <option value="">Откуда</option>
                      {activeFlow.nodes.map((node) => (
                        <option key={`from-${node.id}`} value={node.id}>{node.label || node.id}</option>
                      ))}
                    </select>
                    <select
                      value={effectiveEdgeDraft.toNodeId}
                      onChange={(event) => setEdgeDraft((current) => ({ ...current, toNodeId: event.target.value }))}
                    >
                      <option value="">Куда</option>
                      {activeFlow.nodes.map((node) => (
                        <option key={`to-${node.id}`} value={node.id}>{node.label || node.id}</option>
                      ))}
                    </select>
                    <button type="button" className="small primary" onClick={createEdgeFromDraft}>Создать связь</button>
                  </div>

                  <div className="stack">
                    <div className="label">Текущие связи</div>
                    {activeFlow.edges.length === 0 ? (
                      <div className="chip muted">Связей пока нет</div>
                    ) : (
                      activeFlow.edges.map((edge) => {
                        const fromName = activeFlow.nodes.find((node) => node.id === edge.fromNodeId)?.label || edge.fromNodeId;
                        const toName = activeFlow.nodes.find((node) => node.id === edge.toNodeId)?.label || edge.toNodeId;
                        return (
                          <button
                            key={edge.id}
                            type="button"
                            className={`flows-list-item ${selectedEdge?.id === edge.id ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedNodeId(null);
                              setSelectedEdgeId(edge.id);
                            }}
                          >
                            <span>{`${fromName} -> ${toName}`}</span>
                            <span
                              className="chip danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteEdge(edge.id);
                              }}
                            >
                              x
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {selectedNode && (
                    <div className="stack">
                      <div className="chip">{selectedNode.type}</div>
                      <label className="field">
                        <div className="label">Label</div>
                        <input
                          value={selectedNode.label ?? ''}
                          onChange={(event) => updateSelectedNode((node) => ({ ...node, label: event.target.value }))}
                        />
                      </label>
                      {selectedNode.type === 'method' && (
                        <label className="field">
                          <div className="label">Метод</div>
                          <select
                            value={selectedNode.methodRef?.methodId ?? ''}
                            onChange={(event) =>
                              updateSelectedNode((node) => ({
                                ...node,
                                methodRef: { methodId: event.target.value },
                                label: methodById.get(event.target.value)?.name ?? node.label
                              }))
                            }
                          >
                            <option value="">Выберите метод</option>
                            {methods.map((method) => (
                              <option key={method.id} value={method.id}>{method.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="field">
                        <div className="label">Actor</div>
                        <input
                          value={selectedNode.actor ?? ''}
                          onChange={(event) => updateSelectedNode((node) => ({ ...node, actor: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <div className="label">Описание</div>
                        <textarea
                          className="source-edit"
                          rows={4}
                          value={selectedNode.description ?? ''}
                          onChange={(event) => updateSelectedNode((node) => ({ ...node, description: event.target.value }))}
                        />
                      </label>
                      {selectedNode.type === 'note' && (
                        <label className="field">
                          <div className="label">Note</div>
                          <textarea
                            className="source-edit"
                            rows={4}
                            value={selectedNode.noteContent ?? ''}
                            onChange={(event) => updateSelectedNode((node) => ({ ...node, noteContent: event.target.value }))}
                          />
                        </label>
                      )}
                      <button type="button" className="danger" onClick={() => deleteNode(selectedNode.id)}>Удалить узел</button>
                    </div>
                  )}

                  {!selectedNode && selectedEdge && (
                    <div className="stack">
                      <div className="chip">sequence</div>
                      <label className="field">
                        <div className="label">Условие</div>
                        <input
                          value={selectedEdge.condition ?? ''}
                          onChange={(event) => updateSelectedEdge((edge) => ({ ...edge, condition: event.target.value }))}
                        />
                      </label>
                      <div className="label">Mappings</div>
                      {(selectedEdge.mappings ?? []).map((mapping) => (
                        <div key={mapping.id} className="flow-mapping-card">
                          <input
                            placeholder="source field"
                            value={mapping.source.fieldPath ?? ''}
                            onChange={(event) =>
                              updateMapping(mapping.id, (current) => ({
                                ...current,
                                source: { ...current.source, fieldPath: event.target.value }
                              }))
                            }
                          />
                          <input
                            placeholder="target field"
                            value={mapping.target.fieldPath ?? ''}
                            onChange={(event) =>
                              updateMapping(mapping.id, (current) => ({
                                ...current,
                                target: { ...current.target, fieldPath: event.target.value }
                              }))
                            }
                          />
                          <input
                            placeholder="transform (optional)"
                            value={mapping.transform ?? ''}
                            onChange={(event) =>
                              updateMapping(mapping.id, (current) => ({
                                ...current,
                                transform: event.target.value
                              }))
                            }
                          />
                          <button type="button" className="ghost" onClick={() => removeMapping(mapping.id)}>Удалить</button>
                        </div>
                      ))}
                      <button type="button" className="small" onClick={addMapping}>+ Mapping</button>
                    </div>
                  )}

                  {!selectedNode && !selectedEdge && <div className="empty-state">Выберите узел или связь.</div>}
                </aside>
              </div>
            ) : (
              <div className="panel">
                <h3>Сценарий</h3>
                <ol className="flow-narrative-list">
                  {activeFlow.nodes
                    .slice()
                    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y)
                    .map((node) => {
                      const methodName = node.type === 'method' ? methodById.get(node.methodRef?.methodId ?? '')?.name : null;
                      const nextEdges = activeFlow.edges.filter((edge) => edge.fromNodeId === node.id);
                      return (
                        <li key={node.id}>
                          <strong>{node.label || node.type}</strong>
                          {methodName ? ` (${methodName})` : ''}
                          {node.description ? ` — ${node.description}` : ''}
                          {nextEdges.length > 0 ? ` -> переходов: ${nextEdges.length}` : ''}
                        </li>
                      );
                    })}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">Создайте первый flow для проекта.</div>
        )}
      </section>

      <aside className="flows-issues">
        <h3>Validation</h3>
        {issues.length === 0 ? (
          <div className="chip">Ошибок нет</div>
        ) : (
          <div className="stack">
            {issues.map((issue) => (
              <div key={issue.id} className={`flow-issue ${issue.level}`}>
                <strong>{issue.level.toUpperCase()}</strong> {issue.message}
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
