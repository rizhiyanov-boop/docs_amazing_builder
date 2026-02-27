import fs from 'node:fs';
import path from 'node:path';

const sections = [
  {
    id: 'goal',
    title: 'Цель',
    enabled: true,
    content:
      'Метод предназначен для получения списка депозитных счетов клиента из АБС для отображения в CRM-Light.'
  },
  {
    id: 'headers',
    title: 'Headers',
    enabled: true,
    columns: [
      'Параметр (Server Request)',
      'Тип',
      'Обязательность (+, -, ±)',
      'Описание',
      'Пример'
    ],
    rows: [
      ['X-CLIENT-ID', 'string', '-', 'ID клиента', '123456'],
      ['authorization', 'string', '-', 'Токен для авторизации запросов', 'Bearer ***']
    ]
  },
  {
    id: 'planned',
    title: 'Доработки, планирующиеся на следующих этапах',
    enabled: false
  }
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderHtml(data) {
  const parts = [];
  parts.push('<h1>Smoke test: Документация API</h1>');

  for (const section of data) {
    parts.push(`<h2>${escapeHtml(section.title)}</h2>`);

    if (!section.enabled) {
      parts.push('<p><em>Не используется</em></p>');
      continue;
    }

    if (section.id === 'goal') {
      parts.push(`<p>${escapeHtml(section.content)}</p>`);
      continue;
    }

    if (section.id === 'headers') {
      parts.push('<table border="1" cellspacing="0" cellpadding="6">');
      parts.push('<thead><tr>');
      for (const header of section.columns) {
        parts.push(`<th>${escapeHtml(header)}</th>`);
      }
      parts.push('</tr></thead><tbody>');
      for (const row of section.rows) {
        parts.push('<tr>');
        for (const cell of row) {
          parts.push(`<td>${escapeHtml(cell)}</td>`);
        }
        parts.push('</tr>');
      }
      parts.push('</tbody></table>');
    }
  }

  return ['<!doctype html>', '<html><body>', ...parts, '</body></html>'].join('\n');
}

function escapeWiki(value) {
  return String(value)
    .replaceAll('|', '\\|')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
}

function renderWiki(data) {
  const parts = [];
  parts.push('h1. Smoke test: Документация API');

  for (const section of data) {
    parts.push('');
    parts.push(`h2. ${escapeWiki(section.title)}`);

    if (!section.enabled) {
      parts.push('_Не используется_');
      continue;
    }

    if (section.id === 'goal') {
      parts.push(escapeWiki(section.content));
      continue;
    }

    if (section.id === 'headers') {
      parts.push(`||${section.columns.map(escapeWiki).join('||')}||`);
      for (const row of section.rows) {
        parts.push(`|${row.map(escapeWiki).join('|')}|`);
      }
    }
  }

  return parts.join('\n');
}

const outputDir = path.resolve(process.cwd(), 'output');
fs.mkdirSync(outputDir, { recursive: true });

const html = renderHtml(sections);
const wiki = renderWiki(sections);

fs.writeFileSync(path.join(outputDir, 'smoke-test.html'), html, 'utf-8');
fs.writeFileSync(path.join(outputDir, 'smoke-test.wiki'), wiki, 'utf-8');

console.log('Generated:');
console.log(path.join(outputDir, 'smoke-test.html'));
console.log(path.join(outputDir, 'smoke-test.wiki'));
