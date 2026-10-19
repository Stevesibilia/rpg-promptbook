import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { Extension } from '@codemirror/state';

// Markdown with GitHub's extensions, so the syntax tree has the tables the
// preview draws (design decision 4, Tables).
export const markdownWithTables = (): Extension => markdown({ base: markdownLanguage });
