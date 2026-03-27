import { describe, expect, it } from 'vitest';
import { editorElementToWikiText, richTextToHtml } from './richText';

describe('richText list stability', () => {
  it('keeps nested list structure when parent list item has empty text', () => {
    const source = ['- Parent', '\t- Child 1', '\t- Child 2', '- ', '\t- Nested after empty parent'].join('\n');
    const html = richTextToHtml(source, { editable: true });
    const root = document.createElement('div');
    root.innerHTML = html;

    const roundTrip = editorElementToWikiText(root);

    expect(roundTrip).toContain('- Parent');
    expect(roundTrip).toContain('\t- Child 1');
    expect(roundTrip).toContain('\t- Nested after empty parent');
  });

  it('does not drop ordered/alphabetic nested items during round-trip', () => {
    const source = ['1. Step one', '\ta. Option A', '\ta. Option B', '1. Step two'].join('\n');
    const html = richTextToHtml(source, { editable: true });
    const root = document.createElement('div');
    root.innerHTML = html;

    const roundTrip = editorElementToWikiText(root);

    expect(roundTrip).toContain('1. Step one');
    expect(roundTrip).toContain('\ta. Option A');
    expect(roundTrip).toContain('2. Step two');
  });

  it('keeps nested levels when browser wraps list item content into div blocks', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <ul>
        <li>
          <div>Level 1</div>
          <div>
            <ul>
              <li>
                <div>Level 2</div>
                <div>
                  <ul>
                    <li><div>Level 3</div></li>
                  </ul>
                </div>
              </li>
            </ul>
          </div>
        </li>
      </ul>
    `;

    const wiki = editorElementToWikiText(root);
    expect(wiki).toContain('- Level 1');
    expect(wiki).toContain('\t- Level 2');
    expect(wiki).toContain('\t\t- Level 3');
  });

  it('keeps list levels when the whole list is wrapped by nested div containers', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div>
        <div>
          <ul>
            <li>First</li>
            <li>
              <div>Second</div>
              <div>
                <ul>
                  <li>Second.1</li>
                  <li>
                    <div>
                      <ul>
                        <li>Second.1.1</li>
                      </ul>
                    </div>
                  </li>
                </ul>
              </div>
            </li>
          </ul>
        </div>
      </div>
    `;

    const wiki = editorElementToWikiText(root);
    expect(wiki).toContain('- First');
    expect(wiki).toContain('- Second');
    expect(wiki).toContain('\t- Second.1');
    expect(wiki).toContain('\t\t- Second.1.1');
  });

  it('keeps nested lists when browser emits orphan list node next to li', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <ul>
        <li>Level 1</li>
        <ul>
          <li>Level 2</li>
          <ul>
            <li>Level 3</li>
          </ul>
        </ul>
      </ul>
    `;

    const wiki = editorElementToWikiText(root);
    expect(wiki).toContain('- Level 1');
    expect(wiki).toContain('\t- Level 2');
    expect(wiki).toContain('\t\t- Level 3');
  });

  it('parses nested list levels when indentation uses spaces', () => {
    const source = ['- Root', '  - Child', '    - Child 2'].join('\n');
    const html = richTextToHtml(source, { editable: true });
    const root = document.createElement('div');
    root.innerHTML = html;

    const roundTrip = editorElementToWikiText(root);
    expect(roundTrip).toContain('- Root');
    expect(roundTrip).toContain('\t- Child');
    expect(roundTrip).toContain('\t\t- Child 2');
  });

  it('keeps deep ordered nesting with roman markers during round-trip', () => {
    const source = ['1. Top', '\ta. Mid', '\t\ti. Deep 1', '\t\tii. Deep 2', '2. Next top'].join('\n');
    const html = richTextToHtml(source, { editable: true });
    const root = document.createElement('div');
    root.innerHTML = html;

    const roundTrip = editorElementToWikiText(root);
    expect(roundTrip).toContain('1. Top');
    expect(roundTrip).toContain('\ta. Mid');
    expect(roundTrip).toContain('\t\ti. Deep 1');
    expect(roundTrip).toContain('\t\tii. Deep 2');
    expect(roundTrip).toContain('2. Next top');
  });

  it('preserves roman ordered list marker when serializing editor html', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <ol>
        <li>Top</li>
        <li>
          Mid
          <ol type="a">
            <li>
              Deep
              <ol type="i">
                <li>Item i</li>
                <li>Item ii</li>
              </ol>
            </li>
          </ol>
        </li>
      </ol>
    `;

    const wiki = editorElementToWikiText(root);
    expect(wiki).toContain('\t\ti. Item i');
    expect(wiki).toContain('\t\tii. Item ii');
  });
});
