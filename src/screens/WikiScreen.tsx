import { useMemo, useState, type ReactNode } from 'react';
import { TabPill, TabsPill, WBButton } from '../components/primitives/WorkbenchPrimitives';

type WikiScreenProps = {
  wiki: string;
  onCopy: () => void;
  onDownload: () => void;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderWiki(wiki: string): string {
  const lines = wiki.replace(/&#160;/g, '\u00A0').split(/\r?\n/);
  const headings: string[] = [];
  const output: string[] = [];
  let tableOpen = false;

  for (const line of lines) {
    if (line.trim() === '{toc}') {
      output.push('__TOC__');
      continue;
    }
    const heading = line.match(/^h2\.\s+(.+)$/);
    if (heading) {
      if (tableOpen) {
        output.push('</tbody></table>');
        tableOpen = false;
      }
      const text = heading[1].trim();
      const id = `wiki-${headings.length}`;
      headings.push(text);
      output.push(`<h2 id="${id}">${escapeHtml(text)}</h2>`);
      continue;
    }
    if (line.startsWith('||')) {
      if (!tableOpen) {
        output.push('<table><tbody>');
        tableOpen = true;
      }
      const cols = line.split('||').filter(Boolean);
      output.push(`<tr>${cols.map((col) => `<th>${escapeHtml(col.trim())}</th>`).join('')}</tr>`);
      continue;
    }
    if (line.startsWith('|')) {
      if (!tableOpen) {
        output.push('<table><tbody>');
        tableOpen = true;
      }
      const cols = line.split('|').filter(Boolean);
      output.push(`<tr>${cols.map((col) => `<td>${escapeHtml(col.trim())}</td>`).join('')}</tr>`);
      continue;
    }
    if (tableOpen) {
      output.push('</tbody></table>');
      tableOpen = false;
    }
    if (line.trim()) output.push(`<p>${escapeHtml(line)}</p>`);
  }
  if (tableOpen) output.push('</tbody></table>');

  const toc = `<nav class="wb-wiki-toc">${headings.map((heading, index) => `<a href="#wiki-${index}">${escapeHtml(heading)}</a>`).join('')}</nav>`;
  return output.join('\n').replace('__TOC__', toc);
}

export function WikiScreen({ wiki, onCopy, onDownload }: WikiScreenProps): ReactNode {
  const [mode, setMode] = useState<'source' | 'preview'>('source');
  const html = useMemo(() => renderWiki(wiki), [wiki]);

  return (
    <section style={{ minHeight: '100%', padding: 24, background: 'var(--wb-bg-canvas)', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Wiki</h2>
          <TabsPill>
            <TabPill value="source" active={mode === 'source'} onSelect={setMode}>source</TabPill>
            <TabPill value="preview" active={mode === 'preview'} onSelect={setMode}>preview</TabPill>
          </TabsPill>
          <span style={{ flex: 1 }} />
          <WBButton size="sm" variant="ghost" onClick={onCopy}>Скопировать</WBButton>
          <WBButton size="sm" variant="accent" onClick={onDownload}>Скачать</WBButton>
        </div>
        {mode === 'source' ? (
          <textarea
            className="code"
            readOnly
            value={wiki}
            rows={28}
            style={{ width: '100%', resize: 'vertical', background: 'var(--wb-bg-surface)', color: 'var(--wb-text)', border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius-lg)', padding: 16, fontFamily: 'var(--wb-font-mono)', fontSize: 12.5, lineHeight: 1.5, boxShadow: 'var(--wb-shadow-card)' }}
          />
        ) : (
          <article className="wb-wiki-preview" style={{ background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius-lg)', padding: 24, boxShadow: 'var(--wb-shadow-card)' }} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </section>
  );
}
