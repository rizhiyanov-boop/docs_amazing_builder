import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParsedSectionEditor } from './ParsedSectionEditor';
import { makeRequestSection, makeResponseSection } from '../test/fixtures';

describe('ParsedSectionEditor', () => {
  afterEach(cleanup);
  it.each([
    [makeRequestSection({ title: 'Request' }), 'REQUEST', 'Request'],
    [makeResponseSection({ title: 'Response' }), 'RESPONSE', 'Response']
  ])('leaves section labeling to the enclosing editor header', (section, typeLabel, title) => {
    render(
      <ParsedSectionEditor
        section={section}
        isDualModelSection={() => true}
        renderRequestEditor={() => <div>Editor content</div>}
        renderSourceEditor={() => null}
        onAddManualRow={vi.fn()}
        renderParsedTable={() => null}
      />
    );

    expect(screen.getByText('Editor content')).toBeInTheDocument();
    expect(screen.queryByText(typeLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();
  });
});
