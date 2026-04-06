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

    expect(wiki).toContain('{toc}');
    expect(wiki).toContain('h2. История изменений');
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

  it('renders array paths as empty brackets in wiki and html', () => {
    const sections: DocSection[] = [
      makeRequestSection({
        rows: [
          {
            field: 'items[0]',
            sourceField: 'items[0]',
            origin: 'parsed',
            enabled: true,
            type: 'array_object',
            required: '+',
            description: 'Items list',
            example: '-',
            source: 'body'
          },
          {
            field: 'items[0].name',
            sourceField: 'items[0].name',
            origin: 'parsed',
            enabled: true,
            clientField: 'payload[o].name',
            type: 'string',
            required: '+',
            description: 'Item name',
            example: 'A',
            source: 'body'
          }
        ]
      })
    ];

    const wiki = renderWikiDocument(sections);
    const html = renderHtmlDocument(sections, 'light', { interactive: false });

    expect(wiki).toContain('items[]');
    expect(wiki).toContain('items[].name');
    expect(wiki).toContain('payload[].name');
    expect(wiki).not.toContain('items[0]');
    expect(wiki).not.toContain('payload[o]');

    expect(html).toContain('items[]');
    expect(html).toContain('items[].name');
    expect(html).toContain('payload[].name');
    expect(html).not.toContain('items[0]');
    expect(html).not.toContain('payload[o]');
  });
});
