import { useMemo, useState, type ReactNode } from 'react';
import { WBButton } from '../components/primitives/WorkbenchPrimitives';
import type { WorkbenchAccent } from '../components/workbench/WorkbenchTopbar';

type HtmlExportScreenProps = {
  html: string;
  projectName: string;
  methodName: string;
  accent: WorkbenchAccent;
  onAccentChange: (accent: WorkbenchAccent) => void;
  onCopy: () => void;
  onDownload: () => void;
};

const ACCENTS: Array<{ id: WorkbenchAccent; label: string }> = [
  { id: 'blue', label: 'blue' },
  { id: 'warm', label: 'warm' },
  { id: 'violet', label: 'violet' }
];

function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

function extractHeadings(body: string): Array<{ id: string; text: string }> {
  const matches = [...body.matchAll(/<h([23])[^>]*id=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/h\1>/gi)];
  return matches.map((match, index) => ({
    id: match[2] || `section-${index}`,
    text: match[3].replace(/<[^>]*>/g, '').trim() || `Раздел ${index + 1}`
  }));
}

function highlight(body: string, query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return body;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return body.replace(new RegExp(escaped, 'gi'), (match) => `<mark class="wb-html-search-mark">${match}</mark>`);
}

export function HtmlExportScreen({ html, projectName, methodName, accent, onAccentChange, onCopy, onDownload }: HtmlExportScreenProps): ReactNode {
  const [query, setQuery] = useState('');
  const [snippetMode, setSnippetMode] = useState<'curl' | 'fetch' | 'httpie'>('curl');
  const body = useMemo(() => extractBody(html), [html]);
  const headings = useMemo(() => extractHeadings(body), [body]);
  const highlightedBody = useMemo(() => highlight(body, query), [body, query]);
  const snippet = snippetMode === 'fetch'
    ? "fetch('/mock', { method: 'POST' })"
    : snippetMode === 'httpie'
      ? 'http POST /mock'
      : 'curl -X POST /mock';

  return (
    <section style={{ minHeight: '100%', background: 'var(--wb-bg-canvas)', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}>
      <header className="wb-html-export-header">
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--wb-text)', color: 'var(--wb-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>D</div>
        <div style={{ fontSize: 13, color: 'var(--wb-text-soft)' }}>doc-builder · Published HTML</div>
        <div style={{ fontSize: 12, color: 'var(--wb-text-muted)' }}>{projectName} / {methodName}</div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск"
          className="wb-html-export-search"
          style={{ background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius-sm)', padding: '6px 9px', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}
        />
        <div className="wb-html-export-theme">
          {ACCENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAccentChange(item.id)}
              style={{
                border: `1px solid ${accent === item.id ? 'var(--wb-accent)' : 'var(--wb-border-soft)'}`,
                background: accent === item.id ? 'var(--wb-accent-soft)' : 'var(--wb-bg-soft)',
                color: 'var(--wb-text)',
                borderRadius: 999,
                padding: '4px 8px',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <WBButton size="sm" variant="ghost" onClick={onCopy}>Скопировать</WBButton>
        <WBButton size="sm" variant="accent" onClick={onDownload}>Скачать</WBButton>
      </header>
      <div className="wb-html-export-grid">
        <nav className="wb-html-export-toc">
          {headings.map((heading) => (
            <a key={heading.id} href={`#${heading.id}`} style={{ color: 'var(--wb-text-soft)', textDecoration: 'none', borderLeft: '2px solid var(--wb-border)', padding: '4px 0 4px 8px' }}>{heading.text}</a>
          ))}
        </nav>
        <article
          className="wb-html-export-content"
          style={{ background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius-lg)', boxShadow: 'var(--wb-shadow-card)', padding: 28, minWidth: 0 }}
          dangerouslySetInnerHTML={{ __html: highlightedBody }}
        />
        <aside className="wb-html-export-try">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Try it</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['curl', 'fetch', 'httpie'] as const).map((mode) => (
              <WBButton key={mode} size="sm" variant={snippetMode === mode ? 'secondary' : 'ghost'} onClick={() => setSnippetMode(mode)}>{mode}</WBButton>
            ))}
          </div>
          <pre style={{ margin: 0, padding: 10, background: 'var(--wb-bg-soft)', borderRadius: 'var(--wb-radius)', overflow: 'auto', fontFamily: 'var(--wb-font-mono)', fontSize: 11 }}>{snippet}</pre>
          <WBButton style={{ marginTop: 10 }} size="sm" variant="accent" fullWidth>Выполнить</WBButton>
        </aside>
      </div>
    </section>
  );
}
