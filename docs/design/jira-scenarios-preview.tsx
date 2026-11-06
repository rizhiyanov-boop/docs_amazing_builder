import React from 'react';
import { createRoot } from 'react-dom/client';
import { JiraTaskWorkflow } from '../../src/components/JiraTaskWorkflow';
import type { JiraClient, JiraOperation } from '../../src/jiraClient';
import '../../src/tokens.css';
import '../../src/tokens-workbench.css';
import '../../src/App.css';
import '../../src/screens/ConfluenceScreen.css';
import '../../src/components/workbench/workbench-shell.css';
import { applyThemeToRoot } from '../../src/theme';
applyThemeToRoot('light');
document.documentElement.dataset.wbAccent = 'warm';

const project = { id: '101', key: 'DI', name: 'Department of Integration', url: 'https://jira.example/projects/DI', issueTypes: [] };
const operations = new Map<string, JiraOperation>();
const issues = new Map<string, Parameters<JiraClient['update']>[1]>();
const client: JiraClient = {
  status: async () => ({ connected: true, remembered: true, baseUrl: 'https://jira.example', project, expiresAt: null }),
  metadata: async (_scope, kind) => {
    const currentKind = kind ?? 'story';
    return {
      project,
      issueKind: currentKind,
      story: { id: currentKind === 'task' ? '2' : '1', name: currentKind === 'task' ? 'Задача · тестирование' : 'User Story' },
      epicField: 'epic',
      epicRequired: false,
      labelsSupported: true,
      requiredFields: [],
      priorities: [
        { id: '4', name: 'Low' },
        { id: '3', name: 'Medium' },
        { id: '2', name: 'High' },
        { id: '1', name: 'Critical' }
      ],
      defaultPriorityId: '3',
      editableFields: ['summary', 'description', 'labels', 'priority', 'epic'],
      message: ''
    };
  },
  epics: async () => ({
    items: [
      { key: 'DI-1083', name: 'OpenAPI Improvements' },
      { key: 'DI-20492', name: 'GRKI Integration extensions - Islamic banking' },
      { key: 'DI-10906', name: 'Ucell DMS/CRM integration' },
      { key: 'DI-181', name: 'Улучшения и оптимизация систем' }
    ],
    nextStart: null
  }),
  operation: async (_, id) => operations.get(id) ?? { state: 'none', issue: null, linkedUrl: null },
  create: async (_, body) => {
    const previous = operations.get(body.methodId); if (previous) return previous;
    const key = `DI-${22498 + operations.size}`;
    const operation: JiraOperation = { state: 'success', issue: { id: key, key, url: `https://jira.example/browse/${key}` }, linkedUrl: null };
    operations.set(body.methodId, operation); issues.set(body.methodId, { ...body, epic: body.epic ?? '', labels: body.labels ?? [], priorityId: body.priorityId ?? '3', fingerprint: 'demo' });
    return operation;
  },
  issue: async (scope, id) => {
    const operation = operations.get(id) ?? { state: 'none', issue: null, linkedUrl: null };
    const fields = issues.get(id) ?? { methodId: id, fingerprint: 'demo', summary: '', description: '', epic: '', labels: [], priorityId: '3' };
    const meta = await client.metadata(scope, 'story');
    return { operation, metadata: meta, issue: { id: operation.issue?.id ?? id, key: operation.issue?.key ?? id, url: operation.issue?.url ?? `https://jira.example/browse/${id}`, ...fields, issueType: { id: '1', name: 'User Story' }, updated: '' } };
  },
  update: async (scope, body) => { issues.set(body.methodId, body); return client.issue(scope, body.methodId); },
  unlink: async (_, methodId) => {
    operations.delete(methodId);
    issues.delete(methodId);
    return { state: 'none', issue: null, linkedUrl: null };
  },
  link: async (_, methodId, confluenceUrl) => {
    const op = operations.get(methodId);
    if (op) {
      op.linkedUrl = confluenceUrl ?? null;
    }
    return op ?? { state: 'none', issue: null, linkedUrl: confluenceUrl ?? null };
  },
  confirm: async () => { throw new Error('Не используется в демонстрации'); },
  acceptCurrent: async () => { throw new Error('Не используется в демонстрации'); }
};
function DemoPreview() {
  const [jiraTicket, setJiraTicket] = React.useState('');
  return (
    <div className="wb-app-root" data-accent="warm">
      <main className="cf-screen">
        <h2>Jira · проверка на синтетических данных</h2>
        <p>Эта страница не обращается к реальной Jira или ИИ — можно безопасно тестировать форму и создание задач.</p>
        <JiraTaskWorkflow
          methodId="demo-method"
          methodName="Получить статус заявки"
          methodContext="Получение статуса заявки по идентификатору."
          jiraTicket={jiraTicket}
          active
          onBusyChange={() => {}}
          onLinked={(_m, url) => {
            console.log('Linked method:', _m, url);
            setJiraTicket(url);
          }}
          client={client}
          prepareDraft={async input => ({
            summary: '[OpenAPI] Implement GET /api/organization/account/info routing to Account Domain',
            descriptionRu: input.source?.description ?? 'Реализовать маршрутизацию запросов GET /api/organization/account/info в контур Account Domain.',
            descriptionEn: 'Implement routing of GET /api/organization/account/info requests to Account Domain contour.',
            descriptionUz: 'GET /api/organization/account/info so\'rovlarini Account Domain konturiga marshrutlashni amalga oshirish.',
            rankedEpics: [
              { key: 'DI-1083', reason: 'Спецификация OpenAPI и доработка роутинга' },
              { key: 'DI-181', reason: 'Оптимизация внутренних систем' }
            ],
            labels: [
              { key: 'business', reason: 'Задача от бизнеса' },
              { key: 'improvement', reason: 'Улучшение существующего интерфейса' }
            ],
            priorityId: '3',
            priorityReason: 'Обычное улучшение'
          })}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<DemoPreview />);
