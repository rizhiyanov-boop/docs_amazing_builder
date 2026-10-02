import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONFLUENCE_BRIDGE_URL, ConfluenceClientError, confluenceClient,
  confluenceContentText, confluenceOrigin, confluencePageIdFromLink, confluencePageUrl
} from './confluenceClient';

afterEach(() => { vi.restoreAllMocks(); });
const baseUrl = 'https://confluence.example';

describe('Confluence local client', () => {
  it('reads directly from localhost without credentials or persistence', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ items: [], nextStart: null })));
    const persisted = vi.spyOn(Storage.prototype, 'setItem');
    await confluenceClient.getTree('PERSONAL', '123', 25, baseUrl);
    const [url, options] = fetch.mock.calls[0];
    expect(String(url)).toMatch(`${CONFLUENCE_BRIDGE_URL}/api/tree?`);
    expect(new URL(String(url)).searchParams.get('spaceKey')).toBe('PERSONAL');
    expect(new URL(String(url)).searchParams.get('parentId')).toBe('123');
    expect(new URL(String(url)).searchParams.get('start')).toBe('25');
    expect(options).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', headers: { 'X-DocBuilder-Request': '1', 'X-DocBuilder-Confluence-Origin': baseUrl } });
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(persisted).not.toHaveBeenCalled();
  });

  it('treats transport loss after publish as unknown and never retries the write', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network failure'));
    await expect(confluenceClient.publish({ baseUrl, operationId: 'operation-1', mode: 'create', title: 'Page', spaceKey: 'TEST', storage: '<p>Text</p>' })).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit' });
  });

  it('keeps the original bridge operation identifier for manual recovery', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 'OUTCOME_UNKNOWN', message: 'Check result', operationId: 'original-operation' }), { status: 409 }));
    await expect(confluenceClient.publish({ baseUrl, operationId: 'new-operation', mode: 'create', title: 'Page', spaceKey: 'TEST', storage: '<p>Text</p>' })).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN', operationId: 'original-operation', status: 409 });
  });

  it('confirms a supplied page through a separate endpoint without another publish', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: '123' })));
    await confluenceClient.confirmOperation('original-operation', '123', baseUrl);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(`${CONFLUENCE_BRIDGE_URL}/api/operation/confirm`);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ operationId: 'original-operation', pageId: '123' });
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ 'X-DocBuilder-Confluence-Origin': baseUrl });
  });

  it('accepts only page links on the configured Confluence origin', () => {
    expect(confluencePageIdFromLink(`${baseUrl}/spaces/TEST/pages/123/Page`, baseUrl)).toBe('123');
    expect(confluencePageIdFromLink(`${baseUrl}/pages/viewpage.action?pageId=123`, baseUrl)).toBe('123');
    for (const link of ['https://evil.test/pages/viewpage.action?pageId=123', 'https://confluence.example.evil.test/spaces/TEST/pages/123/a', 'https://name:secret@confluence.example/spaces/TEST/pages/123/a', 'javascript:alert(1)', 'http://confluence.example/spaces/TEST/pages/123/a', 'https://confluence.example:8443/spaces/TEST/pages/123/a']) {
      expect(() => confluencePageIdFromLink(link, baseUrl)).toThrow(ConfluenceClientError);
    }
    expect(confluencePageUrl('123', baseUrl)).toBe(`${baseUrl}/pages/viewpage.action?pageId=123`);
    expect(confluencePageIdFromLink('https://other.example/spaces/TEST/pages/123/a', 'https://other.example')).toBe('123');
  });

  it('rejects an invalid destination before sending page content or any request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const origin of ['', 'http://confluence.example', 'https://name:secret@confluence.example', 'https://confluence.example/path', 'javascript:alert(1)', 'https://confluence.example?token=x']) {
      expect(() => confluenceOrigin(origin)).toThrow(ConfluenceClientError);
      await expect(confluenceClient.prepare('Document', [], origin)).rejects.toMatchObject({ code: 'INVALID_ORIGIN' });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pins each request to its explicit origin without a mutable shared destination', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ storage: '<p>Text</p>' })));
    await confluenceClient.prepare('Document', [], baseUrl);
    await confluenceClient.getPage('123', 'https://other.example');
    await confluenceClient.getOperation('op', baseUrl);
    expect(fetch.mock.calls.map(call => (call[1]?.headers as Record<string, string>)['X-DocBuilder-Confluence-Origin'])).toEqual([baseUrl, 'https://other.example', baseUrl]);
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ wiki: 'Document', diagrams: [], baseUrl });
  });

  it('extracts readable text without mounting HTML, script or external image assets', () => {
    const value = confluenceContentText('<h2>Request</h2><p>A &amp; B</p><table><tr><td>amount</td><td>number</td></tr></table><script>steal()</script><img src="https://external.test/pixel"/><ac:structured-macro ac:name="plantuml"><ac:plain-text-body><![CDATA[A -> B: Text]]></ac:plain-text-body></ac:structured-macro>');
    expect(value).toContain('Request');
    expect(value).toContain('A & B');
    expect(value).toContain('amount\tnumber');
    expect(value).toContain('A -> B: Text');
    expect(value).not.toContain('steal');
    expect(value).not.toContain('external.test');
    expect(document.querySelector('img')).toBeNull();
  });
});
