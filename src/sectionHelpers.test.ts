import { describe, expect, it } from 'vitest';
import { mergeManualHeaders } from './sectionHelpers';
import { makeParsedRow } from './test/fixtures';

describe('mergeManualHeaders', () => {
  it('preserves only manual headers missing from parsed rows', () => {
    const manualHeader = makeParsedRow({ field: 'X-Manual', source: 'header', origin: 'manual' });
    const generatedHeader = makeParsedRow({ field: 'X-Generated', source: 'header', origin: 'generated' });
    const oldBodyRow = makeParsedRow({ field: 'oldField', source: 'body', origin: 'manual' });
    const parsedBodyRow = makeParsedRow({ field: 'newField', source: 'body', origin: 'parsed' });

    expect(mergeManualHeaders(
      [manualHeader, generatedHeader, oldBodyRow],
      [parsedBodyRow]
    )).toEqual([parsedBodyRow, manualHeader]);
  });

  it('prefers a parsed header with the same normalized name', () => {
    const manualHeader = makeParsedRow({ field: ' X-Trace-Id ', source: 'header', origin: 'manual', example: 'manual' });
    const parsedHeader = makeParsedRow({ field: 'x-trace-id', source: 'header', origin: 'parsed', example: 'parsed' });

    expect(mergeManualHeaders([manualHeader], [parsedHeader])).toEqual([parsedHeader]);
  });

  it('keeps manual headers when parsing produces no rows', () => {
    const manualHeader = makeParsedRow({ field: 'X-Manual', source: 'header', origin: 'manual' });
    const parsedHeader = makeParsedRow({ field: 'X-Parsed', source: 'header', origin: 'parsed' });

    expect(mergeManualHeaders([manualHeader, parsedHeader], [])).toEqual([manualHeader]);
  });
});
