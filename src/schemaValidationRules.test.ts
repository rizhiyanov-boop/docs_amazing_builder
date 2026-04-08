import { describe, expect, it } from 'vitest';
import { buildValidationRulesFromSchemaInput } from './schemaValidationRules';

const ALLOWED_TYPES = new Set([
  'NotNull',
  'NotBlank',
  'NotEmpty',
  'Size',
  'Positive',
  'Negative',
  'Past',
  'Future',
  'PastOrPresent',
  'FutureOrPresent',
  'Pattern',
  'Digits',
  'Custom'
]);

describe('buildValidationRulesFromSchemaInput', () => {
  it('uses only allowed validation types from strict dictionary', () => {
    const schema = JSON.stringify({
      type: 'object',
      required: ['name', 'amount', 'items'],
      properties: {
        name: {
          type: 'string',
          minLength: 8,
          maxLength: 64
        },
        amount: {
          type: 'number',
          minimum: 8,
          maximum: 64
        },
        status: {
          type: 'string',
          enum: ['NEW', 'ACTIVE', 'BLOCKED']
        },
        pin: {
          type: 'string',
          pattern: '^\\d{1,5}$'
        },
        phone: {
          type: 'string',
          pattern: '^998[1-9]\\d{8}$'
        },
        items: {
          type: 'array',
          minItems: 1
        }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((row) => ALLOWED_TYPES.has(row.validationCase))).toBe(true);
  });

  it('builds required rules using NotNull/NotBlank/NotEmpty only', () => {
    const schema = JSON.stringify({
      type: 'object',
      required: ['title', 'sum', 'tags'],
      properties: {
        title: { type: 'string' },
        sum: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);

    expect(rules.some((row) => row.parameter === 'title' && row.validationCase === 'NotBlank')).toBe(true);
    expect(rules.some((row) => row.parameter === 'sum' && row.validationCase === 'NotNull')).toBe(true);
    expect(rules.some((row) => row.parameter === 'tags' && row.validationCase === 'NotEmpty')).toBe(true);
  });

  it('keeps validations for the same parameter contiguous', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        amount: { type: 'number', minimum: 1, maximum: 10 },
        code: { type: 'string', minLength: 3, maxLength: 3, pattern: '^\\d{3}$' },
        createdAt: { type: 'string', format: 'date' }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);
    const codeIndexes = rules
      .map((row, index) => (row.parameter === 'code' ? index : -1))
      .filter((index) => index !== -1);

    expect(codeIndexes.length).toBeGreaterThan(1);
    for (let i = 1; i < codeIndexes.length; i += 1) {
      expect(codeIndexes[i]).toBe(codeIndexes[i - 1] + 1);
    }
  });

  it('maps known special patterns to standard pattern causes', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        status: { type: 'string', pattern: '^(NEW|ACTIVE|BLOCKED)$' },
        globId: { type: 'string', pattern: '^(?!0{14})\\d{14}$' },
        phone: { type: 'string', pattern: '^998[1-9]\\d{8}$' }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);

    expect(rules.some((row) => row.parameter === 'status' && row.validationCase === 'Pattern' && row.cause === 'status must be one of: NEW, ACTIVE, BLOCKED')).toBe(true);
    expect(rules.some((row) => row.parameter === 'globId' && row.validationCase === 'Pattern' && row.cause === 'globId must be 14 digits and all digits must not be 0')).toBe(true);
    expect(rules.some((row) => row.parameter === 'phone' && row.validationCase === 'Pattern' && row.cause === 'phone must be valid phone number')).toBe(true);
  });

  it('describes PINFL regex variants with explicit rule text', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        pinfl: { type: 'string', pattern: '^(?!00000000000000)[0-9]{14}$' }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);
    expect(
      rules.some(
        (row) => row.parameter === 'pinfl'
          && row.validationCase === 'Pattern'
          && row.condition === 'Только 14 цифр, и значение не может состоять из одних нулей'
          && row.cause === 'pinfl must be 14 digits and all digits must not be 0'
      )
    ).toBe(true);
  });

  it('does not leak raw regex in pattern condition and cause', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        accountCode: { type: 'string', pattern: '^[A-Z]{2}-\\d{6}$' }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);
    const patternRule = rules.find((row) => row.parameter === 'accountCode' && row.validationCase === 'Pattern');

    expect(patternRule).toBeTruthy();
    expect(patternRule?.condition).toBe('Значение должно содержать последовательно: 2 заглавные латинские буквы, затем символ "-", затем 6 цифр');
    expect(patternRule?.cause).toBe('accountCode must contain latin letters in expected format');
    expect(patternRule?.condition.includes('^')).toBe(false);
    expect(patternRule?.cause.includes('^')).toBe(false);
  });

  it('maps strict digit regex to Digits', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        pin: { type: 'string', pattern: '^\\d{1,5}$' }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);
    expect(rules.some((row) => row.parameter === 'pin' && row.validationCase === 'Digits' && row.condition === 'integer=5' && row.cause === 'pin value must contain no more than 5 digits')).toBe(true);
  });

  it('normalizes array indexes in parameter and cause to empty brackets', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1 }
            }
          }
        }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);
    expect(rules.some((row) => row.parameter === 'items[].name')).toBe(true);
    expect(rules.some((row) => row.cause.includes('items[].name'))).toBe(true);
    expect(rules.some((row) => row.parameter.includes('[0]'))).toBe(false);
    expect(rules.some((row) => row.cause.includes('[0]'))).toBe(false);
  });

  it('avoids square-bracket regex classes in human-readable conditions', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        docDate: { type: 'string', pattern: '^(0[1-9]|[12][0-9]|3[01])\\.(0[1-9]|1[0-2])\\.\\d{4}$' }
      }
    });

    const rules = buildValidationRulesFromSchemaInput(schema);
    const rule = rules.find((row) => row.parameter === 'docDate' && row.validationCase === 'Pattern');
    expect(rule).toBeTruthy();
    expect(rule?.condition.includes('[')).toBe(false);
    expect(rule?.condition.includes(']')).toBe(false);
    expect(rule?.condition.includes('( 1-9 )')).toBe(true);
  });
});
