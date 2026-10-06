import { createElement, useMemo, type ReactNode } from 'react';
import type { ConfluencePage } from '../confluenceTypes';
import { confluencePageUrl } from '../confluenceClient';

const tags = new Set(['p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'sub', 'sup', 'br', 'hr', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'details', 'summary']);
const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'template']);

/** Build React elements from inert content. Never mount upstream HTML, scripts or assets. */
function renderConfluencePreview(page: ConfluencePage, baseUrl: string): ReactNode {
  let root: Node;
  if (page.view !== undefined) {
    const template = document.createElement('template');
    template.innerHTML = page.view;
    root = template.content;
  } else {
    const xml = new DOMParser().parseFromString(`<root xmlns:ac="http://atlassian.com/content" xmlns:ri="http://atlassian.com/resource">${page.storage ?? ''}</root>`, 'application/xml');
    if (xml.querySelector('parsererror')) return <p>Не удалось отобразить содержимое. Откройте страницу в Confluence.</p>;
    root = xml.documentElement;
  }
  let index = 0;
  const walk = (node: Node): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const element = node as Element;
    const tag = element.localName.toLowerCase();
    const key = index++;
    if (blocked.has(tag)) return null;
    if (['img', 'image', 'svg', 'canvas', 'video', 'audio'].includes(tag)) return <span key={key} className="cf-preview-unavailable">Изображение или диаграмма — просмотр в Confluence</span>;
    if (tag === 'structured-macro') {
      const name = element.getAttribute('ac:name') ?? 'Макрос';
      const code = Array.from(element.children).find(child => child.localName === 'plain-text-body')?.textContent;
      const content = Array.from(element.children).find(child => child.localName === 'rich-text-body');
      return <details key={key} open={name !== 'expand'}><summary>{name === 'expand' ? 'Развернуть содержимое' : name}</summary>{code ? <pre>{code}</pre> : content ? Array.from(content.childNodes).map(walk) : <p className="cf-muted">Макрос доступен в Confluence.</p>}</details>;
    }
    const children = Array.from(node.childNodes).map(walk);
    if (tag === 'a') {
      try {
        const url = new URL(element.getAttribute('href') ?? '', baseUrl);
        if (url.origin === new URL(baseUrl).origin && !url.username && !url.password) return <a key={key} href={url.href} target="_blank" rel="noopener noreferrer">{children}</a>;
      } catch { /* Render unsafe or unsupported links as text. */ }
      return <span key={key}>{children}</span>;
    }
    if (!tags.has(tag)) return <span key={key}>{children}</span>;
    const attributes: Record<string, unknown> = { key };
    for (const [source, target] of [['colspan', 'colSpan'], ['rowspan', 'rowSpan']] as const) {
      const value = Number(element.getAttribute(source));
      if (['td', 'th'].includes(tag) && Number.isInteger(value) && value > 0 && value <= 100) attributes[target] = value;
    }
    if (tag === 'details') attributes.open = element.hasAttribute('open');
    return createElement(tag, attributes, ...(['br', 'hr'].includes(tag) ? [] : children));
  };
  return Array.from(root.childNodes).map(walk);
}

export function ConfluencePagePreview({ page, baseUrl, loading = false, connected, updating = false }: {
  page?: ConfluencePage; baseUrl: string; loading?: boolean; connected: boolean; updating?: boolean;
}) {
  const content = useMemo(() => page ? renderConfluencePreview(page, baseUrl) : null, [page, baseUrl]);
  return <section className="cf-page-preview" aria-label={updating ? 'Текущая страница' : 'Просмотр родительской страницы'} aria-busy={loading}>
    <header className="cf-preview-header"><strong>{updating ? 'Текущая страница' : 'Родительская страница'}</strong>
      {page && !loading && connected && <a href={confluencePageUrl(page.id, baseUrl)} target="_blank" rel="noopener noreferrer">Открыть в Confluence ↗</a>}
    </header>
    {loading ? <p role="status" className="cf-preview-empty">Загрузка страницы…</p> : !connected ? <p className="cf-preview-empty">Подключите Confluence для просмотра страницы.</p> : page ? <>
      <div className="cf-preview-meta"><h3>{page.title}</h3><p className="cf-muted">{[page.spaceKey, ...page.ancestors.map(item => item.title), page.title].join(' / ')} · версия {page.version}</p></div>
      <div className="cf-preview-body">{content}</div>
      <p className="cf-preview-note cf-muted">{page.view === undefined ? 'Упрощённый просмотр. Для оформления Confluence обновите локальный сервис до версии 1.2.4. ' : ''}Интерактивные макросы и изображения доступны в Confluence.</p>
    </> : <p className="cf-preview-empty">Выберите страницу в дереве, чтобы увидеть её содержимое.</p>}
  </section>;
}
