import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

// The Markdown reader both documents share: front matter and GitHub tables,
// task lists and strikethrough.
export const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm);
