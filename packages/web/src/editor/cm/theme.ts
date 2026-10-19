import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Emphasis and the quieter marks. Headings, field labels, callouts and the
// front matter take their look from the preview's classes in editor.css.
const highlight = HighlightStyle.define([
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--faint)' },
  { tag: [tags.link, tags.url], color: 'var(--info)' },
  { tag: tags.quote, class: 'cm-quote' },
  { tag: tags.monospace, fontFamily: 'var(--mono)', fontSize: '0.88em' },
]);

export const editorHighlight = syntaxHighlighting(highlight);
