import { describe, expect, it } from 'vitest';
import { renderHtmlDocument } from './renderHtml';
import { renderWikiDocument } from './renderWiki';
import { makeRequestSection, makeSectionsForRender } from './test/fixtures';
import type { DocSection } from './types';

describe('renderers', () => {
  it('renders html document shell and section data', () => {
    const html = renderHtmlDocument(makeSectionsForRender(), 'light', { interactive: false });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Документация API');
    expect(html).toContain('Тестовая цель');
  });

  it('renders wiki document shell and sections', () => {
    const wiki = renderWikiDocument(makeSectionsForRender());

    expect(wiki).toContain('h1. Документация API');
    expect(wiki).toContain('h2. Цель');
    expect(wiki).toContain('Тестовая цель');
  });

  it('renders parse error marker for blocked request section in wiki', () => {
    const sections: DocSection[] = [
      makeRequestSection({
        error: 'Ошибка парсинга',
        rows: []
      })
    ];

    const wiki = renderWikiDocument(sections);
    expect(wiki).toContain('Секция заблокирована');
    expect(wiki).toContain('Ошибка парсинга');
  });
});
