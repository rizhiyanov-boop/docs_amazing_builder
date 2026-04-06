import type { MethodDocument, ProjectFlow } from './types';

export type FlowIssueLevel = 'error' | 'warning';

export type FlowIssue = {
  id: string;
  level: FlowIssueLevel;
  message: string;
};

export function validateProjectFlow(flow: ProjectFlow, methods: MethodDocument[]): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const methodIds = new Set(methods.map((method) => method.id));

  const startCount = flow.nodes.filter((node) => node.type === 'start').length;
  const endCount = flow.nodes.filter((node) => node.type === 'end').length;

  if (startCount === 0) {
    issues.push({ id: 'missing-start', level: 'error', message: 'Flow не содержит стартового узла.' });
  }

  if (endCount === 0) {
    issues.push({ id: 'missing-end', level: 'error', message: 'Flow не содержит конечного узла.' });
  }

  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      issues.push({
        id: `dangling-edge-${edge.id}`,
        level: 'error',
        message: 'Связь ссылается на отсутствующий узел.'
      });
    }
  }

  for (const node of flow.nodes) {
    if (node.type !== 'method') continue;
    const methodId = node.methodRef?.methodId;
    if (!methodId || !methodIds.has(methodId)) {
      issues.push({
        id: `broken-method-${node.id}`,
        level: 'error',
        message: `Узел "${node.label || node.id}" ссылается на удалённый метод.`
      });
    }
  }

  for (const node of flow.nodes) {
    const hasAnyEdge = flow.edges.some((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id);
    if (!hasAnyEdge && node.type !== 'note') {
      issues.push({
        id: `isolated-${node.id}`,
        level: 'warning',
        message: `Узел "${node.label || node.id}" изолирован от сценария.`
      });
    }
  }

  const endNodeIds = new Set(flow.nodes.filter((node) => node.type === 'end').map((node) => node.id));
  for (const node of flow.nodes) {
    if (node.type === 'end' || node.type === 'note') continue;
    const hasOutgoing = flow.edges.some((edge) => edge.fromNodeId === node.id);
    if (!hasOutgoing && !endNodeIds.has(node.id)) {
      issues.push({
        id: `no-outgoing-${node.id}`,
        level: 'warning',
        message: `Узел "${node.label || node.id}" не имеет исходящих переходов.`
      });
    }
  }

  for (const edge of flow.edges) {
    for (const mapping of edge.mappings ?? []) {
      if (!nodeIds.has(mapping.source.nodeId) || !nodeIds.has(mapping.target.nodeId)) {
        issues.push({
          id: `broken-mapping-${mapping.id}`,
          level: 'warning',
          message: 'Один из mapping ссылается на удалённый узел.'
        });
      }
    }
  }

  return issues;
}
