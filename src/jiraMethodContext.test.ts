import { describe, expect, it } from 'vitest';
import { jiraMethodContext } from './jiraMethodContext';
import { makeRequestSection } from './test/fixtures';

describe('Jira method context', () => {
  it('includes legacy disabled sections while still omitting source payloads and endpoint query secrets', () => {
    const context = jiraMethodContext({
      id: 'm1', name: 'Demo', updatedAt: '2026-10-14T00:00:00Z', sections: [
        { id: 'goal', title: 'Goal', kind: 'text', enabled: false, value: 'Retained content' },
        makeRequestSection({ enabled: false, requestUrl: 'https://example.com/v1/demo?token=secret-query', input: '{"token":"secret-payload"}' })
      ]
    });
    expect(context).toContain('Retained content');
    expect(context).toContain('/v1/demo');
    expect(context).not.toContain('secret-query');
    expect(context).not.toContain('secret-payload');
  });
});
