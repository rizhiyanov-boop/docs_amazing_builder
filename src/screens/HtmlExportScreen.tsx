import { useMemo, useState, type ReactNode } from 'react';
import { HttpChip, WBButton } from '../components/primitives/WorkbenchPrimitives';
import type { WorkbenchAccent } from '../components/workbench/WorkbenchTopbar';
import type { ProjectExportDetailMode } from '../projectExport';

type HtmlExportScreenProps = {
  html: string;
  projectName: string;
  methodName: string;
  requestUrl?: string;
  requestMethod?: string;
  accent: WorkbenchAccent;
  projectDetailMode?: ProjectExportDetailMode;
  onProjectDetailModeChange?: (mode: ProjectExportDetailMode) => void;
  onAccentChange: (accent: WorkbenchAccent) => void;
  onCopy: () => void;
  onDownload: () => void;
};

const ACCENTS: Array<{ id: WorkbenchAccent; label: string }> = [
  { id: 'blue', label: 'Daylight' },
  { id: 'warm', label: 'Kraft' },
  { id: 'violet', label: 'Dusk' }
];

function extractBody(html: string): string {
  const mainMatch = html.match(/<main[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1];
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

function extractHeadings(body: string): Array<{ id: string; text: string }> {
  const matches = [...body.matchAll(/<h([1-6])[^>]*id=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const headings = matches.map((match, index) => ({
    id: match[2] || `section-${index}`,
    text: match[3].replace(/<[^>]*>/g, '').trim() || `Section ${index + 1}`
  }));
  if (headings.length > 0) return headings;

  const cardMatches = [...body.matchAll(/<section[^>]*class=["'][^"']*\bcard\b[^"']*["'][^>]*id=["']?([^"'>\s]+)["']?[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
  return cardMatches.map((match, index) => ({
    id: match[1] || `section-${index}`,
    text: match[2].replace(/<[^>]*>/g, '').trim() || `Section ${index + 1}`
  }));
}

function highlight(body: string, query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return body;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return body.replace(new RegExp(escaped, 'gi'), (match) => `<mark class="wb-html-search-mark">${match}</mark>`);
}

function extractRequestVariables(requestUrl: string): string[] {
  const variables = new Set<string>();
  for (const match of requestUrl.matchAll(/\{([^}]+)\}|:([A-Za-z][\w-]*)/g)) {
    const name = (match[1] || match[2] || '').trim();
    if (name) variables.add(name);
  }
  return [...variables];
}

export function HtmlExportScreen({
  html,
  projectName,
  methodName,
  requestUrl = '/',
  requestMethod = 'POST',
  accent,
  projectDetailMode,
  onProjectDetailModeChange,
  onAccentChange,
  onCopy,
  onDownload
}: HtmlExportScreenProps): ReactNode {
  const [query, setQuery] = useState('');
  const [snippetMode, setSnippetMode] = useState<'curl' | 'fetch' | 'httpie'>('curl');
  const [variablesOpen, setVariablesOpen] = useState(false);
  const body = useMemo(() => extractBody(html), [html]);
  const headings = useMemo(() => extractHeadings(body), [body]);
  const highlightedBody = useMemo(() => highlight(body, query), [body, query]);
  const requestVariables = useMemo(() => extractRequestVariables(requestUrl), [requestUrl]);
  const normalizedMethod = requestMethod.toUpperCase();
  const snippet = snippetMode === 'fetch'
    ? `fetch('${requestUrl}', { method: '${normalizedMethod}' })`
    : snippetMode === 'httpie'
      ? `http ${normalizedMethod} ${requestUrl}`
      : `curl -X ${normalizedMethod} ${requestUrl}`;
  const snippetLines = snippet.split('\n');

  return (
    <section style={{ minHeight: '100%', background: 'var(--wb-bg-canvas)', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}>
      <header className="wb-html-export-header">
        <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--wb-text)', color: 'var(--wb-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>D</div>
        <div className="wb-html-export-label">doc-builder · Published HTML</div>
        <nav className="wb-html-export-breadcrumbs" aria-label="HTML export breadcrumbs">
          <button type="button" className="wb-html-export-breadcrumb" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>API</button>
          <span aria-hidden="true">/</span>
          <button type="button" className="wb-html-export-breadcrumb" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>{projectName}</button>
          <span aria-hidden="true">/</span>
          <HttpChip method={normalizedMethod} size="sm" />
          <span className="wb-html-export-current">{methodName}</span>
        </nav>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="wb-html-export-search"
          style={{ background: 'var(--wb-bg-soft)', border: '1px solid var(--wb-border-soft)', borderRadius: 'var(--wb-radius-sm)', padding: '6px 9px', color: 'var(--wb-text)', fontFamily: 'var(--wb-font-sans)' }}
        />
        <div className="wb-html-export-theme">
          {projectDetailMode && onProjectDetailModeChange && (
            <div role="group" aria-label="Режим экспорта проекта" style={{ display: 'flex', gap: 4 }}>
              {(['full', 'brief'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onProjectDetailModeChange(mode)}
                  style={{
                    border: `1px solid ${projectDetailMode === mode ? 'var(--wb-accent)' : 'var(--wb-border-soft)'}`,
                    background: projectDetailMode === mode ? 'var(--wb-accent-soft)' : 'var(--wb-bg-soft)',
                    color: 'var(--wb-text)',
                    borderRadius: 999,
                    padding: '4px 8px',
                    fontSize: 11,
                    cursor: 'pointer'
                  }}
                >
                  {mode === 'full' ? 'Полный' : 'Краткий'}
                </button>
              ))}
            </div>
          )}
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
        <WBButton size="sm" variant="ghost" onClick={onCopy}>Copy</WBButton>
        <WBButton size="sm" variant="accent" onClick={onDownload}>Download</WBButton>
      </header>
      <div className="wb-html-export-grid">
        <nav className="wb-html-export-toc" aria-label="HTML table of contents">
          <div className="wb-html-export-toc-label">On this page</div>
          {headings.length === 0 && <div className="wb-html-export-toc-empty">No sections</div>}
          {headings.map((heading, index) => (
            <a key={heading.id} href={`#${heading.id}`} className={`wb-html-export-toc-link${index === 0 ? ' is-active' : ''}`}>{heading.text}</a>
          ))}
        </nav>
        <article
          className="wb-html-export-content"
          style={{ background: 'var(--wb-bg-surface)', border: '1px solid var(--wb-border)', borderRadius: 'var(--wb-radius-lg)', boxShadow: 'var(--wb-shadow-card)', padding: 28, minWidth: 0 }}
          dangerouslySetInnerHTML={{ __html: highlightedBody }}
        />
        <aside className="wb-html-export-try">
          <div className="wb-html-export-try-header">
            <div>
              <div className="wb-html-export-try-title">Try it</div>
              <div className="wb-html-export-try-subtitle">{normalizedMethod} {requestUrl}</div>
            </div>
            <HttpChip method={normalizedMethod} size="sm" />
          </div>
          <div className="wb-html-export-snippet-tabs">
            {(['curl', 'fetch', 'httpie'] as const).map((mode) => (
              <WBButton key={mode} size="sm" variant={snippetMode === mode ? 'secondary' : 'ghost'} onClick={() => setSnippetMode(mode)}>{mode}</WBButton>
            ))}
          </div>
          <pre className="wb-html-export-code">
            {snippetLines.map((line, index) => (
              <code key={`${line}-${index}`} className="wb-html-export-code-line">
                <span>{index + 1}</span>
                <span>{line || ' '}</span>
              </code>
            ))}
          </pre>
          <button type="button" className="wb-html-export-vars-toggle" onClick={() => setVariablesOpen((open) => !open)}>
            <span>Variables ({requestVariables.length})</span>
            <span aria-hidden="true">{variablesOpen ? '▴' : '▾'}</span>
          </button>
          {variablesOpen && (
            <div className="wb-html-export-vars">
              {requestVariables.length > 0 ? requestVariables.map((variable) => (
                <div key={variable} className="wb-html-export-var-row">
                  <code>{variable}</code>
                  <span>path</span>
                </div>
              )) : (
                <div className="wb-html-export-vars-empty">No variables detected</div>
              )}
            </div>
          )}
          <WBButton style={{ marginTop: 10 }} size="sm" variant="accent" fullWidth>Run</WBButton>
        </aside>
      </div>
    </section>
  );
}
