import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { parse } from 'yaml';
import { z } from 'zod';

describe('parsing stack', () => {
  it('reads front matter, a heading and a GFM table', () => {
    const text = '---\ntitolo: Prova\n---\n\n## Scene\n\n| a | b |\n| - | - |\n| 1 | 2 |\n';
    const tree = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).parse(text);
    expect(tree.children.map((node) => node.type)).toEqual(['yaml', 'heading', 'table']);
    const yamlNode = tree.children[0];
    expect(yamlNode?.type === 'yaml' && parse(yamlNode.value)).toEqual({ titolo: 'Prova' });
    expect(z.string().parse('ok')).toBe('ok');
  });
});
