import { describe, expect, it } from 'vitest';
import { renderConfluenceDocument } from './confluenceDocument';
import { sectionsForMethodTemplate } from './methodTemplates';
import { loadWorkspaceProjectFromPayload } from './projectImport';
import { renderWikiDocument } from './renderWiki';
import { asWorkspaceProjectData, createTemplatedMethod } from './workspaceBootstrap';

describe('fixed method templates', () => {
  it('keeps the public example as entered and excludes Client data from both publication paths', () => {
    const method = createTemplatedMethod('simple');
    method.sections = method.sections.map(section => {
      if (section.kind === 'parsed' && section.sectionType === 'response') return {
        ...section, input: '{"data":{"amount":42}}', clientInput: '{"external":true}', clientError: 'Hidden Client error'
      };
      if (section.kind === 'errors') return {
        ...section, rows: [{ ...section.rows[0], clientHttpStatus: '422', clientResponse: 'Hidden Client response', message: 'Public error' }]
      };
      return section;
    });
    const wiki = renderWikiDocument(method.sections, {}, { templateId: method.templateId });
    for (const output of [wiki, renderConfluenceDocument(method).wiki]) {
      const jsonExample = output.match(/\{code:json\}\s*([\s\S]*?)\s*\{code\}/u)?.[1];
      expect(JSON.parse(jsonExample ?? 'null')).toEqual({ data: { amount: 42 } });
      expect(output).toContain('|Внешний URL|-|');
      expect(output).toContain('Public error');
      for (const hidden of ['techData', 'Client Response||', 'Client HTTP Status', 'Hidden Client', '{"external":true}']) {
        expect(output).not.toContain(hidden);
      }
    }
  });

  it('round trips an orchestration project with the method ID and no per-section mode flags', () => {
    const method = createTemplatedMethod('orchestration');
    const workspace = asWorkspaceProjectData('Example', [method], method.id);
    const loaded = loadWorkspaceProjectFromPayload(JSON.parse(JSON.stringify(workspace))).methods[0];
    expect(loaded.templateId).toBe('orchestration');
    const contracts = sectionsForMethodTemplate(loaded.sections, loaded.templateId).filter(section => section.kind === 'parsed');
    expect(contracts.map(section => section.domainModelEnabled)).toEqual([true, true]);
    expect(loaded.sections.filter(section => section.kind === 'parsed').every(section => !Object.hasOwn(section, 'domainModelEnabled'))).toBe(true);
  });
});
