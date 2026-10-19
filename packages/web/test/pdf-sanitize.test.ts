// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../src/editor/pdf/sanitize.js';

const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
  <script>alert(2)</script>
  <g class="typst-page" id="pb-page-1" onClick="alert(3)" ONMOUSEOVER='alert(4)'>
    <a class="typst-content-link" href="https://example.com"><rect class="pseudo-link"/></a>
    <a href="javascript:alert(5)"><rect/></a>
    <a xlink:href=" javascript:alert(6)"><rect/></a>
    <a xlink:href="#pb-page-1"><rect/></a>
    <use href="#g1"/>
    <path id="g1" d="M 0 0" fill="#1c1a17"/>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">text</div></foreignObject>
    <animate attributeName="href" to="javascript:alert(7)"/>
    <set attributeName="onclick" to="alert(8)"/>
    <animateMotion/><animateTransform/>
  </g>
</svg>`;

describe('the SVG sanitiser', () => {
  const svg = sanitizeSvg(hostile)!;
  const markup = svg.outerHTML;

  it('drops scripts, foreign objects and animations', () => {
    for (const name of ['script', 'foreignObject', 'animate', 'set', 'animateMotion', 'animateTransform'])
      expect(svg.getElementsByTagName(name)).toHaveLength(0);
    expect(markup).not.toContain('alert(2)');
    expect(markup).not.toContain('text');
  });

  it('removes every on* attribute, whatever its case or quotes', () => {
    expect(markup).not.toMatch(/\son[a-z]+=/i);
    expect(markup).not.toContain('alert');
  });

  it('keeps only links inside the document', () => {
    const links = Array.from(svg.getElementsByTagName('a')).map(
      (a) => a.getAttribute('href') ?? a.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
    );
    expect(links).toEqual([null, null, null, '#pb-page-1']);
    expect(svg.getElementsByTagName('use')[0]!.getAttribute('href')).toBe('#g1');
  });

  it('keeps the drawing', () => {
    expect(svg.getElementById('pb-page-1')).not.toBeNull();
    expect(svg.getElementsByTagName('path')[0]!.getAttribute('fill')).toBe('#1c1a17');
  });

  it('gives null for text that is not SVG', () => {
    expect(sanitizeSvg('<html><body/></html>')).toBeNull();
    expect(sanitizeSvg('<svg')).toBeNull();
  });
});
