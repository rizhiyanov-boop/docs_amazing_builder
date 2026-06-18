import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ParsedSectionEditor } from './ParsedSectionEditor';
import { makeRequestSection, makeResponseSection } from '../test/fixtures';

describe('ParsedSectionEditor', () => {
  it.each([
    [makeRequestSection({ title: 'Request' }), 'REQUEST', 'Request'],
    [makeResponseSection({ title: 'Response' }), 'RESPONSE', 'Response']
  ])('shows only the uppercase type label for dual-model sections', (section, typeLabel, title) => {
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

    expect(screen.getByText(typeLabel)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();
  });
});
