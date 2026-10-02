import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderConfluenceDocument } from './confluenceDocument';
import * as diagramUtils from './diagramUtils';
import { renderWikiDocument } from './renderWiki';
import { makeParsedRow, makeRequestSection } from './test/fixtures';
import type { DiagramSection, MethodDocument } from './types';

function makeDiagramSection(overrides: Partial<DiagramSection> = {}): DiagramSection {
  return {
    id: 'diagram', title: 'Взаимодействие', kind: 'diagram', enabled: true,
    diagrams: [{
      id: 'same-id', title: 'Основной сценарий', engine: 'plantuml',
      code: '@startuml\nA -> B: Запрос\n@enduml', description: 'Описание | {сценария}'
    }],
    ...overrides
  };
}

function makeMethod(overrides: Partial<MethodDocument> = {}): MethodDocument {
  return {
    id: 'crif', name: 'CRIF', updatedAt: '2026-10-02T08:00:00Z',
    jiraTicket: 'DI-123', responsible: 'Автор',
    sections: [makeDiagramSection()],
    ...overrides
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Confluence method document', () => {
  it('prepares native diagrams without calling or embedding an external renderer', () => {
    const renderer = vi.spyOn(diagramUtils, 'getDiagramImageUrl');
    const method = makeMethod({ sections: [
      makeRequestSection({ rows: [makeParsedRow({ field: 'items[0].name', type: 'string', example: 'Иван' })] }),
      makeDiagramSection({ diagrams: [
        { id: 'same-id', title: 'UML', engine: 'mermaid', code: '@startuml\nA -> B: <& ]]> | {code}\n@enduml' },
        { id: 'same-id', title: 'Mermaid', engine: 'plantuml', code: 'sequenceDiagram\nA->>B: Получить', description: 'Подпись | {текст}' }
      ] })
    ] });
    const document = renderConfluenceDocument(method);

    expect(renderer).not.toHaveBeenCalled();
    expect(document.wiki).not.toMatch(/mermaid\.ink|plantuml\.com/);
    expect(document.wiki).not.toContain('@startuml');
    expect(document.wiki).not.toContain('sequenceDiagram');
    expect(document.diagrams).toEqual([
      { placeholder: 'DOCBUILDER_DIAGRAM_0001', engine: 'plantuml', code: '@startuml\nA -> B: <& ]]> | {code}\n@enduml' },
      { placeholder: 'DOCBUILDER_DIAGRAM_0002', engine: 'mermaid', code: 'sequenceDiagram\nA->>B: Получить' }
    ]);
    for (const diagram of document.diagrams) {
      expect(document.wiki).toContain(`\n\n${diagram.placeholder}\n\n`);
      expect(document.wiki.split(diagram.placeholder)).toHaveLength(2);
    }
    expect(document.wiki).toContain('Подпись &#124; &#123;текст&#125;');
    expect(document.wiki).toContain('h3. Mermaid');
    expect(document.wiki).toContain('DI-123');
    expect(document.wiki).toContain('|items[].name|string|');
    expect(document.wiki).toContain('Иван');
  });

  it('leaves the existing Wiki diagram format and source expansion unchanged by default', () => {
    const renderer = vi.spyOn(diagramUtils, 'getDiagramImageUrl').mockReturnValue('https://renderer.example/diagram');
    const diagram = makeDiagramSection();
    const wiki = renderWikiDocument([diagram], {}, { includeToc: false, includeTemplateIntro: false });

    expect(renderer).toHaveBeenCalledExactlyOnceWith('plantuml', diagram.diagrams[0].code, 'jpeg');
    expect(wiki).toBe([
      '', 'h2. Взаимодействие', '', 'h3. Основной сценарий', '!https://renderer.example/diagram!',
      'Описание &#124; &#123;сценария&#125;', '{expand:title=Код диаграммы}', '{code}',
      '@startuml\nA -> B: Запрос\n@enduml', '{code}', '{expand}'
    ].join('\n'));
  });

  it('renders the process first, retains section order, and excludes empty or disabled diagram source', () => {
    const process = makeDiagramSection({ id: 'process-diagram', title: 'Диаграмма процесса' });
    const disabled = makeDiagramSection({ id: 'disabled', title: 'Отключенная', enabled: false });
    const empty = makeDiagramSection({ id: 'empty', diagrams: [{ id: 'empty', title: 'Пустая', engine: 'mermaid', code: '  \n' }] });
    const document = renderConfluenceDocument(makeMethod({ sections: [
      { id: 'text', kind: 'text', title: 'Требования', enabled: true, value: '*Кратко*\nСписок | {данные}' },
      disabled, empty, process,
      makeDiagramSection({ id: 'other', title: 'Другой сценарий' })
    ] }));

    expect(document.diagrams).toHaveLength(2);
    expect(document.wiki.indexOf('h2. Диаграмма процесса')).toBeLessThan(document.wiki.indexOf('h2. Требования'));
    expect(document.wiki.indexOf('h2. Требования')).toBeLessThan(document.wiki.indexOf('h2. Другой сценарий'));
    expect(document.wiki).toContain('h2. Отключенная\n\n_Не используется_');
    expect(document.wiki).not.toContain('Пустая');
    expect(document.wiki.match(/h3\. Основной сценарий/g)).toHaveLength(1);
    expect(document.wiki).toContain('*Кратко*\nСписок &#124; &#123;данные&#125;');
  });

  it('avoids mistaking existing user text for a native replacement marker', () => {
    const document = renderConfluenceDocument(makeMethod({ sections: [
      { id: 'text', kind: 'text', title: 'Примечание', enabled: true, value: 'DOCBUILDER_DIAGRAM_0001 DOCBUILDER_DIAGRAM_0001_X' },
      makeDiagramSection()
    ] }));

    expect(document.diagrams[0].placeholder).toBe('DOCBUILDER_DIAGRAM_0001_X_X');
    expect(document.wiki).toContain('DOCBUILDER_DIAGRAM_0001 DOCBUILDER_DIAGRAM_0001_X');
    expect(document.wiki).toContain('\n\nDOCBUILDER_DIAGRAM_0001_X_X\n\n');
  });

  it('uses stable metadata and detects changes in the title, prose, diagram source, and metadata', () => {
    const method = makeMethod();
    const initial = renderConfluenceDocument(method);
    expect(renderConfluenceDocument(method)).toEqual(initial);
    expect(renderConfluenceDocument({ ...method, id: 'different-internal-id' }).fingerprint).toBe(initial.fingerprint);
    expect(renderConfluenceDocument({ ...method, name: 'CRIF новый' }).fingerprint).not.toBe(initial.fingerprint);
    expect(renderConfluenceDocument(method, { jiraTicket: 'DI-124' }).fingerprint).not.toBe(initial.fingerprint);
    expect(renderConfluenceDocument(makeMethod({ sections: [makeDiagramSection({
      diagrams: [{ ...makeDiagramSection().diagrams[0], code: '@startuml\nA -> C\n@enduml' }]
    })] })).fingerprint).not.toBe(initial.fingerprint);
    expect(renderConfluenceDocument(makeMethod({ sections: [makeDiagramSection({
      diagrams: [{ ...makeDiagramSection().diagrams[0], description: 'Другая подпись' }]
    })] })).fingerprint).not.toBe(initial.fingerprint);
    expect(initial.wiki).toContain('02.10.2026');
    expect(initial.fingerprint).toMatch(/^docbuilder-v1-[0-9a-f]{16}$/);
  });

  it('remains compatible with ordinary Wiki output when the method has no diagrams', () => {
    const method = makeMethod({ sections: [makeRequestSection({ rows: [makeParsedRow()] })] });
    const meta = {
      httpMethod: 'POST', path: 'https://api.example.com/method', jiraTicket: method.jiraTicket,
      responsible: method.responsible, updatedAt: method.updatedAt
    };
    const document = renderConfluenceDocument(method);
    expect(document.wiki).toBe(renderWikiDocument(method.sections, meta));
    expect(document.diagrams).toEqual([]);
  });
});
