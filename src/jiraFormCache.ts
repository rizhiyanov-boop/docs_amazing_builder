import type { JiraDraft } from './jiraDraft';
import type { JiraIssueKind, JiraScope } from './jiraClient';

/** Local form data only: never part of the workspace/server snapshot or credential store. */
export type JiraFormCache = {
  issueKind: JiraIssueKind;
  summary: string; descriptionRu: string; descriptionEn: string; descriptionUz: string;
  description: string; epic: string; labels: string[]; priorityId: string;
  search: string; epicQuery: string; draft?: JiraDraft;
  issueKey?: string; fingerprint?: string;
  dirty?: boolean;
};
export function jiraFormCacheKey(scope: JiraScope, methodId: string): string {
  return `docbuilder:jira-form:v1:${encodeURIComponent(scope.baseUrl)}:${encodeURIComponent(scope.projectId)}:${encodeURIComponent(methodId)}`;
}
export function readJiraFormCache(key: string): JiraFormCache | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 200_000) return;
    const value = JSON.parse(raw);
    if (!value || !['task', 'story'].includes(value.issueKind) || !['summary', 'descriptionRu', 'descriptionEn', 'descriptionUz', 'description', 'epic', 'priorityId', 'search', 'epicQuery'].every(field => typeof value[field] === 'string') || !Array.isArray(value.labels) || value.labels.some((label: unknown) => typeof label !== 'string')) return;
    if (value.issueKey !== undefined && typeof value.issueKey !== 'string' || value.fingerprint !== undefined && typeof value.fingerprint !== 'string') return;
    if (value.dirty !== undefined && typeof value.dirty !== 'boolean') return;
    if (value.draft && (!Array.isArray(value.draft.labels) || !Array.isArray(value.draft.rankedEpics) || [...value.draft.labels, ...value.draft.rankedEpics].some(item => !item || typeof item.key !== 'string' || typeof item.reason !== 'string'))) delete value.draft;
    return value;
  } catch { return; }
}
export function writeJiraFormCache(key: string, value: JiraFormCache): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
