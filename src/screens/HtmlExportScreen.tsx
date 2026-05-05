import { useMemo, useState, type ReactNode } from 'react';
import { WBButton } from '../components/primitives/WorkbenchPrimitives';

type HtmlExportScreenProps = {
  html: string;
  projectName: string;
  methodName: string;
  onCopy: () => void;
  onDownload: () => void;
};

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

export function HtmlExportScreen({ html, projectName, methodName, onCopy, onDownload }: HtmlExportScreenProps): ReactNode {
  const [query, setQuery] = useState('');
  const body = useMemo(() => extractBody(html), [html]);
  const headings = useMemo(() => extractHeadings(body), [body]);
  const highlightedBody = useMemo(() => highlight(body, query), [body, query]);

  return (
    <section style={{ minHeight: '100%', background: 'var(--wb-bg-canvas)', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 5, height: 56, background: 'var(--wb-bg-surface)', borderBottom: '1px solid var(--wb-border)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px' }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--wb-text)', color: 'var(--wb-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>D</div>
        <div style={{ fontSize: 13, color: 'var(--wb-text-soft)' }}>doc-builder · Published HTML</div>
        <div style={{ fontSize: 12, color: 'var(--wb-text-muted)' }}>{projectName} / {methodName}</div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск"
          style={{ marginLeft: 'auto', minWidth: 220, background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius-sm)', padding: '6px 9px', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}
        />
        <WBButton size="sm" variant="ghost" onClick={onCopy}>Скопировать</WBButton>
        <WBButton size="sm" variant="accent" onClick={onDownload}>Скачать</WBButton>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 760px) minmax(220px, 1fr)', gap: 20, padding: 24, alignItems: 'start' }}>
        <nav style={{ position: 'sticky', top: 80, fontSize: 13, display: 'grid', gap: 6 }}>
          {headings.map((heading) => (
            <a key={heading.id} href={`#${heading.id}`} style={{ color: 'var(--wb-text-soft)', textDecoration: 'none', borderLeft: '2px solid var(--wb-border)', padding: '4px 0 4px 8px' }}>{heading.text}</a>
          ))}
        </nav>
        <article
          className="wb-html-export-content"
          style={{ background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius-lg)', boxShadow: 'var(--wb-shadow-card)', padding: 28, minWidth: 0 }}
          dangerouslySetInnerHTML={{ __html: highlightedBody }}
        />
        <aside style={{ position: 'sticky', top: 80, background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius-lg)', padding: 14, boxShadow: 'var(--wb-shadow-card)' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Try it</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <WBButton size="sm" variant="secondary">curl</WBButton>
            <WBButton size="sm" variant="ghost">fetch</WBButton>
            <WBButton size="sm" variant="ghost">httpie</WBButton>
          </div>
          <pre style={{ margin: 0, padding: 10, background: 'var(--wb-bg-soft)', borderRadius: 'var(--wb-radius)', overflow: 'auto', fontFamily: 'var(--wb-font-mono)', fontSize: 11 }}>curl -X POST /mock</pre>
          <WBButton style={{ marginTop: 10 }} size="sm" variant="accent" fullWidth>Выполнить</WBButton>
        </aside>
      </div>
    </section>
  );
}
