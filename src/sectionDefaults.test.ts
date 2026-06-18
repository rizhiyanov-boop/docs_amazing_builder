import { describe, expect, it } from 'vitest';
import { createParsedSection } from './sectionFactories';
import { sanitizeSections } from './sectionTitles';
import type { ParsedSection } from './types';

describe('contract mode defaults', () => {
  it('creates request and response sections in orchestration mode', () => {
    expect(createParsedSection('request').domainModelEnabled).toBe(true);
    expect(createParsedSection('response').domainModelEnabled).toBe(true);
    expect(createParsedSection('generic').domainModelEnabled).toBeUndefined();
  });

  it('defaults legacy dual-model sections to orchestration without overriding explicit simple mode', () => {
    const legacyRequest = {
      ...createParsedSection('request', 'request'),
      domainModelEnabled: undefined
    } satisfies ParsedSection;
    const simpleResponse = {
      ...createParsedSection('response', 'response'),
      domainModelEnabled: false
    } satisfies ParsedSection;

    const normalized = sanitizeSections([legacyRequest, simpleResponse]) as ParsedSection[];

    expect(normalized[0]?.domainModelEnabled).toBe(true);
    expect(normalized[1]?.domainModelEnabled).toBe(false);
  });
});
