import { describe, expect, it } from 'vitest';
import { formatDocumentationUrl, replaceDocumentationUrls } from './documentationBaseUrl';

describe('documentation base url', () => {
  it('renders full internal url without duplicating /api', () => {
    expect(formatDocumentationUrl('https://example.com/api/payments?status=NEW')).toBe('https://api-internal-tst.ipotekabank.uz/api/payments?status=NEW');
    expect(formatDocumentationUrl('/api/payments')).toBe('https://api-internal-tst.ipotekabank.uz/api/payments');
  });

  it('replaces only the first URL in cURL text', () => {
    const curl = 'curl -X POST "https://example.com/api/payments" --data-raw \'{"callbackUrl":"https://callback.example.com"}\'';

    expect(replaceDocumentationUrls(curl)).toBe(
      'curl -X POST "https://api-internal-tst.ipotekabank.uz/api/payments" --data-raw \'{"callbackUrl":"https://callback.example.com"}\''
    );
  });
});
