import { describe, expect, it } from 'vitest';
import { renderEditableCodeBlockHtml, richTextToHtml } from './richText';

describe('rich text code blocks', () => {
  it('renders editable code blocks with inline language selector', () => {
    const html = richTextToHtml('{code:typescript}\nconst amount = 10;\n{code}', { editable: true });

    expect(html).toContain('data-code-language-select="1"');
    expect(html).toContain('<option value="typescript" selected>');
    expect(html).toContain('const amount = 10;');
  });

  it('creates editable code block markup for inserted fences', () => {
    const html = renderEditableCodeBlockHtml('', 'bash');

    expect(html).toContain('data-rich-code-block="1"');
    expect(html).toContain('data-code-language="bash"');
    expect(html).toContain('Code block language');
  });
});
