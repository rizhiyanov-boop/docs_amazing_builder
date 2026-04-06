import type { MethodDocument, ProjectFlow } from './types';

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeLabel(value: string): string {
  return value.replace(/"/g, '\\"');
}

export function buildFlowMermaid(flow: ProjectFlow | null | undefined, methods: MethodDocument[]): string {
  if (!flow) return 'graph LR\n  empty["Flow is empty"]';

  const methodById = new Map(methods.map((method) => [method.id, method]));
  const lines: string[] = ['graph LR'];

  for (const node of flow.nodes) {
    const nodeId = sanitizeId(node.id);
    const methodName = node.type === 'method'
      ? methodById.get(node.methodRef?.methodId ?? '')?.name ?? node.label ?? 'Method'
      : node.label || node.type;
    const text = escapeLabel(methodName);
    lines.push(`  ${nodeId}["${text}"]`);
  }

  if (flow.edges.length === 0) {
    return `${lines.join('\n')}\n  empty["No edges"]`;
  }

  for (const edge of flow.edges) {
    const fromId = sanitizeId(edge.fromNodeId);
    const toId = sanitizeId(edge.toNodeId);
    if (edge.condition?.trim()) {
      lines.push(`  ${fromId} -->|${escapeLabel(edge.condition.trim())}| ${toId}`);
      continue;
    }
    lines.push(`  ${fromId} --> ${toId}`);
  }

  return lines.join('\n');
}

export function autoLayoutFlow(flow: ProjectFlow): ProjectFlow {
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();

  for (const node of flow.nodes) {
    outgoing.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) continue;
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
    incomingCount.set(edge.toNodeId, (incomingCount.get(edge.toNodeId) ?? 0) + 1);
  }

  const queue: string[] = flow.nodes
    .filter((node) => node.type === 'start' || (incomingCount.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  if (queue.length === 0 && flow.nodes[0]) queue.push(flow.nodes[0].id);

  const level = new Map<string, number>();
  for (const id of queue) level.set(id, 0);

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const nextLevel = (level.get(current) ?? 0) + 1;
    for (const next of outgoing.get(current) ?? []) {
      const previous = level.get(next);
      if (previous === undefined || nextLevel > previous) {
        level.set(next, nextLevel);
      }
      const nextIn = (incomingCount.get(next) ?? 1) - 1;
      incomingCount.set(next, nextIn);
      if (nextIn <= 0) queue.push(next);
    }
  }

  const nodesByLevel = new Map<number, string[]>();
  for (const node of flow.nodes) {
    const nodeLevel = level.get(node.id) ?? 0;
    if (!nodesByLevel.has(nodeLevel)) nodesByLevel.set(nodeLevel, []);
    nodesByLevel.get(nodeLevel)?.push(node.id);
  }

  const sortedLevels = Array.from(nodesByLevel.keys()).sort((a, b) => a - b);
  const positionById = new Map<string, { x: number; y: number }>();

  for (const layer of sortedLevels) {
    const nodes = nodesByLevel.get(layer) ?? [];
    nodes.sort((aId, bId) => {
      const left = flow.nodes.find((node) => node.id === aId);
      const right = flow.nodes.find((node) => node.id === bId);
      return (left?.position.y ?? 0) - (right?.position.y ?? 0);
    });
    nodes.forEach((nodeId, index) => {
      positionById.set(nodeId, {
        x: 80 + layer * 280,
        y: 80 + index * 150
      });
    });
  }

  return {
    ...flow,
    updatedAt: new Date().toISOString(),
    nodes: flow.nodes.map((node) => ({
      ...node,
      position: positionById.get(node.id) ?? node.position
    }))
  };
}
