import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { ChangeSet, EditorSelection, EditorState } from '@codemirror/state';
import { parseAdventure, templates, type ParseResult } from 'promptbook-format';
import { analysis, setAnalysis } from '../src/editor/analysis/field.js';

export const parse = (text: string): ParseResult => parseAdventure(text, { template: templates.avventura });

const noWorker = (): never => {
  throw new Error('no worker in these tests');
};

// A state whose analysis is the result for its own text: fresh. The cursor
// at `cursor`, 0 by default.
export function analysed(doc: string, cursor = 0): { state: EditorState; result: ParseResult } {
  const result = parse(doc);
  let state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: analysis({ checked: true, connect: noWorker }),
  });
  state = state.update({
    effects: setAnalysis.of({ doc: state.doc, result, changes: ChangeSet.empty(state.doc.length) }),
  }).state;
  return { state, result };
}

// A campaign's state: not parsed, with its Markdown tree complete.
export function campaign(doc: string, cursor = 0): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown(), analysis({ checked: false, connect: noWorker })],
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}
