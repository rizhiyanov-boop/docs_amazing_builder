import { describe, expect, it } from 'vitest';
import { buildValidationCause } from './validationCause';

describe('buildValidationCause', () => {
  it('builds not-null message with field name replacement', () => {
    const cause = buildValidationCause({
      parameter: 'amount',
      validationCase: 'NotNull',
      condition: '',
      parameterType: 'long'
    });

    expect(cause).toBe('amount must not be null');
  });

  it('builds not-blank message for string', () => {
    const cause = buildValidationCause({
      parameter: 'name',
      validationCase: 'NotBlank',
      condition: '',
      parameterType: 'string'
    });

    expect(cause).toBe('name must not be blank');
  });

  it('builds size range message for string', () => {
    const cause = buildValidationCause({
      parameter: 'username',
      validationCase: 'Size',
      condition: 'min=8, max=64',
      parameterType: 'string'
    });

    expect(cause).toBe('username length must be between 8 and 64');
  });

  it('builds numeric size range message for numbers', () => {
    const cause = buildValidationCause({
      parameter: 'amount',
      validationCase: 'Size',
      condition: 'min=8, max=64',
      parameterType: 'long'
    });

    expect(cause).toBe('amount value must be between 8 and 64');
  });

  it('builds pattern message for enum regex', () => {
    const cause = buildValidationCause({
      parameter: 'status',
      validationCase: 'Pattern',
      condition: '^(NEW|ACTIVE|BLOCKED)$',
      parameterType: 'string'
    });

    expect(cause).toBe('status must be one of: NEW, ACTIVE, BLOCKED');
  });

  it('builds custom date cause using date from condition', () => {
    const cause = buildValidationCause({
      parameter: 'operationDate',
      validationCase: 'Custom',
      condition: 'не раньше чем 2025-12-10',
      parameterType: 'LocalDate'
    });

    expect(cause).toBe('operationDate must be after "2025-12-10"');
  });

  it('builds digits cause using integer limit', () => {
    const cause = buildValidationCause({
      parameter: 'pin',
      validationCase: 'Digits',
      condition: 'integer=5',
      parameterType: 'string'
    });

    expect(cause).toBe('pin value must contain no more than 5 digits');
  });
});
