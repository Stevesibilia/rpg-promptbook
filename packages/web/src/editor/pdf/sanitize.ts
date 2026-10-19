// The rendered document as the page inserts it (design decision 9). The
// worker already strips what it can with text patterns; the page parses the
// SVG and cleans it again before inserting it, since a Markdown link or an
// odd attribute in the document must never become live in the app.

const DROPPED = new Set(['script', 'foreignobject', 'animate', 'set', 'animatemotion', 'animatetransform']);
const LINKS = new Set(['href', 'xlink:href']);

// The SVG element to insert, or null when the text does not parse as SVG.
export function sanitizeSvg(svg: string, parser: DOMParser = new DOMParser()): SVGSVGElement | null {
  const document = parser.parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || document.getElementsByTagName('parsererror').length) return null;
  for (const element of [root, ...Array.from(root.getElementsByTagName('*'))]) {
    if (DROPPED.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const unsafe = name.startsWith('on') || (LINKS.has(name) && !attribute.value.trim().startsWith('#'));
      if (unsafe) element.removeAttributeNode(attribute);
    }
  }
  return root as unknown as SVGSVGElement;
}
