import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfluencePagePreview } from './ConfluencePagePreview';
import type { ConfluencePage } from '../confluenceTypes';

afterEach(cleanup);
const baseUrl = 'https://confluence.example';
const page: ConfluencePage = { id: '123', title: 'Parent', spaceKey: 'TEST', version: 1, url: baseUrl, ancestors: [] };
describe('Confluence page preview', () => {
  it('preserves tables and code while dropping executable content and asset requests', () => {
    const view = '<h2>Heading</h2><table><tbody><tr><td colspan="2" onclick="steal()">Cell</td></tr></tbody></table><pre>Code</pre><script>secret()</script><iframe src="https://outside.example"></iframe><img src="https://outside.example/track"><a href="javascript:steal()">Unsafe</a><a href="/pages/viewpage.action?pageId=124">Internal</a>';
    const { container } = render(<ConfluencePagePreview page={{ ...page, view }} baseUrl={baseUrl} connected />);
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Cell' })).toHaveAttribute('colspan', '2');
    expect(container.querySelector('script, iframe, img, [onclick]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Internal' })).toHaveAttribute('href', `${baseUrl}/pages/viewpage.action?pageId=124`);
    expect(screen.getByText('Code')).toBeInTheDocument();
  });
  it('supports older bridges using storage and identifies an unavailable macro', () => {
    const storage = '<p>Old content</p><ac:structured-macro ac:name="mermaiddiagram"><ac:plain-text-body><![CDATA[flowchart LR\nA --> B]]></ac:plain-text-body></ac:structured-macro>';
    render(<ConfluencePagePreview page={{ ...page, storage }} baseUrl={baseUrl} connected />);
    expect(screen.getByText('Old content')).toBeInTheDocument();
    expect(screen.getByText('mermaiddiagram')).toBeInTheDocument();
    expect(screen.getByText(/Упрощённый просмотр/)).toBeInTheDocument();
  });
});
