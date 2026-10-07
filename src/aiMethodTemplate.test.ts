import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import schema from './importContract/workspace-v3.schema.json';
import { parseProjectImportText } from './projectImport';
import { ERROR_CATALOG } from './errorCatalog';
import { JIRA_LABELS, JIRA_PRIORITY_RULES } from './jiraLabels';
import { DEFAULT_REQUEST_HEADERS } from './requestHeaders';
import type { ErrorRow, MethodDocument, ParsedRow } from './types';

type AuthoringTemplate = {
  outputSchema: { $ref: string; definitions: Record<string, object> };
  documentTemplate: MethodDocument;
  referenceData: {
    rowTypes: string[];
    headers: Array<{ field: string; type: string; required: string }>;
    errorCodes: Array<{ internalCode: string; defaultHttpStatus: string; message: string }>;
    jiraLabels: typeof JIRA_LABELS;
    jiraPriorityGuidelines: typeof JIRA_PRIORITY_RULES;
  };
  examples: { businessErrorRow: ErrorRow; publicDateRow: ParsedRow; maskedPersonalField: ParsedRow };
};

function readTemplate(): AuthoringTemplate {
  return JSON.parse(readFileSync(resolve('public/docbuilder-ai-method-template.json'), 'utf8'));
}

function assertMethodSchema(template: AuthoringTemplate) {
  const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
  addFormats(ajv, ['date-time']);
  const validate = ajv.compile(template.outputSchema);
  expect(validate(template.documentTemplate), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({ methods: [template.documentTemplate] })).toBe(false);
}

describe('Static AI method authoring template', () => {
  it('keeps the offline schema and dictionaries aligned with the application', () => {
    const template = readTemplate();
    expect(template.outputSchema.$ref).toBe('#/definitions/method');
    for (const [key, definition] of Object.entries(template.outputSchema.definitions)) {
      expect(definition).toEqual(schema.definitions[key as keyof typeof schema.definitions]);
    }
    expect(template.outputSchema.definitions).not.toHaveProperty('flow');
    expect(template.outputSchema.definitions).not.toHaveProperty('projectSection');
    expect(template.referenceData.rowTypes).toEqual(schema.definitions.row.properties.type.enum);
    expect(template.referenceData.jiraLabels).toEqual(JIRA_LABELS);
    expect(template.referenceData.jiraPriorityGuidelines).toEqual(JIRA_PRIORITY_RULES);
    expect(template.referenceData.headers.map(({ field, type, required }) => ({ field, type, required })))
      .toEqual(DEFAULT_REQUEST_HEADERS.map(({ field, type, required }) => ({ field, type, required })));
    for (const item of ERROR_CATALOG.filter(item => item.httpStatus !== '-')) {
      expect(template.referenceData.errorCodes.find(code => code.internalCode === item.internalCode))
        .toMatchObject({ internalCode: item.internalCode, defaultHttpStatus: item.httpStatus, message: item.message });
    }
    expect(template.referenceData.errorCodes.find(code => code.internalCode === '700107'))
      .toMatchObject({ defaultHttpStatus: '408' });
    expect(template.referenceData.errorCodes.some(code => code.internalCode === '400101')).toBe(false);
  });

  it('imports the standalone skeleton through the existing method import path', () => {
    const template = readTemplate();
    const document = template.documentTemplate;
    assertMethodSchema(template);
    expect(document).not.toHaveProperty('methods');
    expect(document).not.toHaveProperty('importProfile');
    const imported = parseProjectImportText(JSON.stringify(document), 'generated-method.json');
    if (imported.kind !== 'workspace') throw new Error('Expected a workspace document');
    // The importer creates internal workspace defaults; only the method is merged by the UI.
    expect(imported.warnings.map(issue => issue.path)).toEqual(['projectSections', 'flows']);
    expect(imported.workspace.methods).toHaveLength(1);
    expect(imported.workspace.activeMethodId).toBe(document.id);
    expect(imported.workspace.methods[0]).toMatchObject(document);
  });

  it('preserves the date, masking and BusinessException examples through the real importer', () => {
    const template = readTemplate();
    const document = template.documentTemplate;
    const request = document.sections.find(section => section.id === 'request');
    const errors = document.sections.find(section => section.id === 'errors');
    if (request?.kind !== 'parsed' || errors?.kind !== 'errors') throw new Error('Expected canonical sections');
    request.rows.push(template.examples.publicDateRow, template.examples.maskedPersonalField);
    errors.rows.push(template.examples.businessErrorRow);
    assertMethodSchema(template);
    const imported = parseProjectImportText(JSON.stringify(document), 'generated-method.json');
    if (imported.kind !== 'workspace') throw new Error('Expected a workspace document');
    const loadedRequest = imported.workspace.methods[0].sections.find(section => section.id === 'request');
    const loadedErrors = imported.workspace.methods[0].sections.find(section => section.id === 'errors');
    if (loadedRequest?.kind !== 'parsed' || loadedErrors?.kind !== 'errors') throw new Error('Expected canonical sections');
    expect(loadedRequest.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'operationDate', example: '07.10.2026' }),
      expect.objectContaining({ field: 'personId', maskInLogs: true })
    ]));
    expect(loadedErrors.rows[0]).toEqual(template.examples.businessErrorRow);
    expect(loadedErrors.rows[0].serverHttpStatus).toBe('422');
  });
});
