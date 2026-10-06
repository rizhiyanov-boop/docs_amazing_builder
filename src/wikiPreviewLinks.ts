function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Link separators belong to a Wiki link, not to the surrounding table. */
export function splitWikiPreviewRow(line: string): string[] {
  const cells: string[] = []; let cell = ''; let inLink = false;
  for (const character of line) {
    if (character === '[') inLink = true;
    if (character === ']') inLink = false;
    if (character === '|' && !inLink) { if (cell) cells.push(cell); cell = ''; }
    else cell += character;
  }
  if (cell) cells.push(cell);
  return cells;
}

export function renderWikiPreviewInline(value: string): string {
  const output: string[] = []; let end = 0;
  for (const match of value.matchAll(/\[([^[\]\r\n|]+)\|([^[\]\r\n]+)\]/g)) {
    output.push(escapeHtml(value.slice(end, match.index)));
    let html = escapeHtml(match[0]);
    try {
      const url = new URL(match[2]);
      if (url.protocol === 'https:' && !url.username && !url.password) html = `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`;
    } catch { /* Unsupported links remain plain text. */ }
    output.push(html); end = match.index + match[0].length;
  }
  output.push(escapeHtml(value.slice(end)));
  return output.join('');
}
