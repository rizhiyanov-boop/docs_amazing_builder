import { describe, expect, it } from 'vitest';
import { buildServerErrorResponseTemplate } from './errorResponseTemplate';

describe('buildServerErrorResponseTemplate', () => {
  it('creates expected server response json shape', () => {
    const json = buildServerErrorResponseTemplate({
      code: '400201',
      message: 'Resource not found'
    });

    const parsed = JSON.parse(json) as {
      error: { code: string; message: string; cause: unknown[]; externalCode: string; fields: unknown[] };
      techData: { traceId: string; spanId: string; appVersion: string; appTag: string };
      warnings: Record<string, string>;
    };

    expect(parsed.error.code).toBe('400201');
    expect(parsed.error.message).toBe('Resource not found');
    expect(parsed.error.cause).toEqual([]);
    expect(parsed.error.externalCode).toBe('unknown');
    expect(parsed.error.fields).toEqual([]);
    expect(parsed.techData.traceId).toBe('d6c8a977a8f0f543ecc9ce8b80e8ac73');
    expect(parsed.warnings.clientId).toContain('X-CLIENT-ID');
  });
});
