import { getRequestColumnLabel, getRequestColumnOrder } from './requestColumns';
import { getRequestAuthInfo, getRequestRows, requestHasRows, splitRequestRows } from './requestHeaders';
import { resolveSectionTitle } from './sectionTitles';
import { getDiagramImageUrl, resolveDiagramEngine } from './diagramUtils';
import type { DiagramSection, DocSection, ErrorsSection, ParsedRow, ParsedSection, TextSection } from './types';

const EMPTY_WIKI_CELL = '&#160;';

function escapeWiki(value: string): string {
  return value.replaceAll('|', '&#124;');
}

function isDualModelSection(section: ParsedSection): boolean {
  return section.sectionType === 'request' || section.sectionType === 'response';
}

function toWikiCell(value: string): string {
  const normalized = escapeWiki(value)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\t', ' ')
    .split('\n')
    .map((part) => part.trimEnd())
    .join('<br/>');

  return normalized.trim() ? normalized : EMPTY_WIKI_CELL;
}

function toWikiExampleCell(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) return EMPTY_WIKI_CELL;
  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (looksLikeJson) {
    try {
      // Keep JSON in table cells single-line so wiki table markup remains valid.
      return toWikiCell(JSON.stringify(JSON.parse(trimmed)));
    } catch {
      return toWikiCell(trimmed);
    }
  }
  return toWikiCell(trimmed);
}

function toWikiSourceCodeBlock(value: string, format: 'json' | 'curl'): string[] {
  const normalized = value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .trim();

  if (!normalized) return [];

  let payload = normalized;
  if (format === 'json') {
    try {
      payload = JSON.stringify(JSON.parse(normalized), null, 2);
    } catch {
      // Keep original content if it isn't valid JSON.
    }
  }

  const codeLanguage = format === 'json' ? 'json' : 'bash';

  return [`{code:${codeLanguage}}`, ...payload.split('\n').map((line) => escapeWiki(line)), '{code}'];
}

function renderParsedSourceExamples(section: ParsedSection): string[] {
  const lines: string[] = [];
  const serverInput = section.input.trim();
  const clientInput = section.domainModelEnabled ? (section.clientInput ?? '').trim() : '';
  const sectionLabel = section.sectionType === 'response' ? 'response' : 'request';
  const serverFormat = section.format;
  const clientFormat = section.clientFormat ?? 'json';

  const serverFormatLabel = serverFormat === 'curl' ? 'cURL' : 'JSON';
  const clientFormatLabel = clientFormat === 'curl' ? 'cURL' : 'JSON';

  if (serverInput) {
    lines.push('');
    lines.push(`{expand:title=Пример ${serverFormatLabel} (Server ${sectionLabel})}`);
    lines.push(...toWikiSourceCodeBlock(serverInput, serverFormat));
    lines.push('{expand}');
  }

  if (clientInput) {
    lines.push('');
    lines.push(`{expand:title=Пример ${clientFormatLabel} (Client ${sectionLabel})}`);
    lines.push(...toWikiSourceCodeBlock(clientInput, clientFormat));
    lines.push('{expand}');
  }

  return lines;
}

function hasParsedSourceExample(section: ParsedSection): boolean {
  return Boolean(section.input.trim()) || Boolean(section.domainModelEnabled && (section.clientInput ?? '').trim());
}

function toWikiTextBlock(value: string): string[] {
  return value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((line) => escapeWiki(line));
}

function shouldRenderTextSection(section: TextSection): boolean {
  if (!section.enabled) return true;
  return Boolean(section.value.trim());
}

function shouldRenderParsedSection(section: ParsedSection): boolean {
  if (!section.enabled) return true;
  if (isDualModelSection(section)) {
    return Boolean(section.error) || Boolean(section.clientError) || requestHasRows(section) || hasParsedSourceExample(section);
  }
  return Boolean(section.error) || section.rows.length > 0;
}

function shouldRenderDiagramSection(section: DiagramSection): boolean {
  if (!section.enabled) return true;
  return section.diagrams.some((diagram) => diagram.code.trim());
}

function shouldRenderErrorsSection(section: ErrorsSection): boolean {
  if (!section.enabled) return true;
  return section.rows.length > 0 || section.validationRules.length > 0;
}

function renderDefaultTable(rows: ParsedRow[]): string[] {
  const lines = ['||Поле||Тип||Обязательность||Описание||Пример||'];
  for (const row of rows) {
    const cells = [toWikiCell(row.field), toWikiCell(row.type), toWikiCell(row.required), toWikiCell(row.description), toWikiExampleCell(row.example)];
    lines.push(`|${cells.join('|')}|`);
  }
  return lines;
}

function renderStructuredTable(rows: ParsedRow[], section: ParsedSection): string[] {
  const columns = getRequestColumnOrder(section, rows);
  const headerCells = columns.map((column) => getRequestColumnLabel(section, column));
  const lines = [`||${headerCells.join('||')}||`];

  for (const row of rows) {
    const cellMap = {
      field: row.field,
      clientField: row.clientField ?? '',
      type: row.type,
      required: row.required,
      description: row.description,
      example: row.example
    };

    const cells = columns.map((column) => {
      const value = cellMap[column];
      if (column === 'example') return toWikiExampleCell(value);
      return toWikiCell(value);
    });

    lines.push(`|${cells.join('|')}|`);
  }

  return lines;
}

function renderTextSection(section: TextSection): string[] {
  if (!section.enabled) {
    return [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`, '', '_Не используется_'];
  }

  return [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`, '', ...toWikiTextBlock(section.value)];
}

function renderRequestSection(section: ParsedSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];
  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  const { headers, otherRows, urlRow } = splitRequestRows(getRequestRows(section));
  const requestError = section.error || section.clientError;
  const authInfo = getRequestAuthInfo(section);
  const requestUrl = section.requestUrl?.trim() || (urlRow?.example ?? '');
  const requestMethod = section.requestMethod?.trim() || section.format.toUpperCase();
  const requestProtocol = section.requestProtocol?.trim() || 'REST';
  const externalRequestUrl = section.externalRequestUrl?.trim() || '';
  const externalRequestMethod = section.externalRequestMethod?.trim() || 'POST';
  const externalHeaders = (section.clientRows ?? []).filter((row) => row.source === 'header' && row.enabled !== false);

  lines.push('');
  lines.push('h3. Общее описание метода');
  lines.push('');
  if (requestUrl) {
    lines.push(`*URL:* ${toWikiCell(requestUrl)}`);
  }
  lines.push(`*Метод:* ${toWikiCell(requestMethod)}`);
  lines.push(`*Протокол:* ${toWikiCell(requestProtocol)}`);

  if (authInfo) {
    lines.push('');
    lines.push('h3. Authorization');
    lines.push('');
    for (const detail of authInfo.details) {
      lines.push(`*${escapeWiki(detail.label)}:* ${toWikiCell(detail.value)}`);
    }
  }
  if (headers.length > 0) {
    lines.push('');
    lines.push('h3. Headers');
    lines.push('');
    lines.push(...renderStructuredTable(headers, section));
  }
  if (section.domainModelEnabled) {
    lines.push('');
    lines.push('h3. Внешний вызов');
    lines.push('');
    if (externalRequestUrl) {
      lines.push(`*Внешний URL:* ${toWikiCell(externalRequestUrl)}`);
    }
    lines.push(`*Метод:* ${toWikiCell(externalRequestMethod)}`);
    lines.push(`*Протокол:* ${toWikiCell(requestProtocol)}`);
  }
  if (externalHeaders.length > 0) {
    lines.push('');
    lines.push('h3. Внешние headers');
    lines.push('');
    lines.push(...renderStructuredTable(externalHeaders, section));
  }
  if (requestError) {
    lines.push('');
    lines.push(`*Секция заблокирована:* ${toWikiCell(requestError)}`);
  } else if (otherRows.length > 0) {
    lines.push('');
    lines.push('h3. Параметры');
    lines.push('');
    lines.push(...renderStructuredTable(otherRows, section));
  }

  lines.push(...renderParsedSourceExamples(section));

  return lines;
}
function renderResponseSection(section: ParsedSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];
  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  if (section.error || section.clientError) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error || section.clientError || '')}`);
    lines.push(...renderParsedSourceExamples(section));
    return lines;
  }

  lines.push(...renderStructuredTable(getRequestRows(section), section));
  lines.push(...renderParsedSourceExamples(section));
  return lines;
}

function renderParsedSection(section: ParsedSection): string[] {
  if (section.sectionType === 'request') return renderRequestSection(section);
  if (section.sectionType === 'response') return renderResponseSection(section);

  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  if (section.error) {
    lines.push(`*Секция заблокирована:* ${toWikiCell(section.error)}`);
    return lines;
  }

  lines.push(...renderDefaultTable(section.rows));
  return lines;
}

function renderDiagramSection(section: DiagramSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  section.diagrams
    .filter((diagram) => diagram.code.trim())
    .forEach((diagram, index) => {
      const title = diagram.title.trim() || `Диаграмма ${index + 1}`;
      const imageUrl = getDiagramImageUrl(resolveDiagramEngine(diagram.code, diagram.engine), diagram.code, 'jpeg');

      lines.push('');
      lines.push(`h3. ${escapeWiki(title)}`);
      lines.push(`!${escapeWiki(imageUrl)}!`);
      if (diagram.description?.trim()) {
        lines.push(...toWikiTextBlock(diagram.description));
      }
      lines.push('{expand:title=Код диаграммы}');
      lines.push('{code}');
      lines.push(escapeWiki(diagram.code));
      lines.push('{code}');
      lines.push('{expand}');
    });

  return lines;
}

function renderErrorsSection(section: ErrorsSection): string[] {
  const lines: string[] = [`h2. ${escapeWiki(resolveSectionTitle(section.title))}`];

  if (!section.enabled) {
    lines.push('');
    lines.push('_Не используется_');
    return lines;
  }

  if (section.rows.length > 0) {
    lines.push('');
    lines.push('||№||Client HTTP Status||Client Response||Trigger (условия возникновения)||Error Type||Server HTTP Status||Полный internalCode||Server Response||');

    section.rows.forEach((row, index) => {
      lines.push(
        `|${toWikiCell(String(index + 1))}|${toWikiCell(row.clientHttpStatus)}|${toWikiCell(row.clientResponse)}|${toWikiCell(row.trigger)}|${toWikiCell(row.errorType)}|${toWikiCell(row.serverHttpStatus)}|${toWikiCell(row.internalCode)}|${toWikiCell(row.message)}|`
      );
    });
  }

  if (section.validationRules.length > 0) {
    lines.push('');
    lines.push('h3. Правила валидации');
    lines.push('||№||Параметр (server request)||Кейс валидации||Условие возникновения||cause||');

    section.validationRules.forEach((row, index) => {
      lines.push(
        `|${toWikiCell(String(index + 1))}|${toWikiCell(row.parameter)}|${toWikiCell(row.validationCase)}|${toWikiCell(row.condition)}|${toWikiCell(row.cause)}|`
      );
    });
  }

  return lines;
}

export function renderWikiDocument(sections: DocSection[]): string {
  const lines: string[] = ['{toc}', '', 'h1. Документация API'];

  for (const section of sections) {
    const rendered =
      section.kind === 'text'
        ? shouldRenderTextSection(section)
          ? renderTextSection(section)
          : []
        : section.kind === 'parsed'
          ? shouldRenderParsedSection(section)
            ? renderParsedSection(section)
            : []
          : section.kind === 'diagram'
            ? shouldRenderDiagramSection(section)
              ? renderDiagramSection(section)
              : []
            : shouldRenderErrorsSection(section)
              ? renderErrorsSection(section)
              : [];

    if (rendered.length > 0) {
      lines.push('');
      lines.push(...rendered);
    }
  }

  return lines.join('\n');
}
