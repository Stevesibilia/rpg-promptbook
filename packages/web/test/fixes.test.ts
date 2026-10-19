import { ChangeSet, EditorState } from '@codemirror/state';
import { parseAdventure, templates, type ParseResult } from 'promptbook-format';
import { describe, expect, it, vi } from 'vitest';
import sabaoth from '../../format/fixtures/l-ancora-di-sabaoth.converted.md?raw';
import { analysis, analysisField, isFresh, setAnalysis } from '../src/editor/analysis/field.js';
import { fixEdits } from '../src/editor/fixes.js';

const parse = (text: string) => parseAdventure(text, { template: templates.avventura });

// Sabaoth has an unknown field in S5, «Se il tempo stringe», whose fix turns
// it into a box.
const text = sabaoth;
const CODE = 'scene.field.unknown';

// A state whose analysis is the result for its own text: fresh.
function analysed(doc: string): { state: EditorState; result: ParseResult } {
  const result = parse(doc);
  let state = EditorState.create({ doc, extensions: analysis({ checked: true, connect: () => fail() }) });
  state = state.update({
    effects: setAnalysis.of({ doc: state.doc, result, changes: ChangeSet.empty(state.doc.length) }),
  }).state;
  return { state, result };
}

const fail = (): never => {
  throw new Error('no worker in these tests');
};

const target = (result: ParseResult) => {
  const problem = result.problems.find((p) => p.code === CODE)!;
  return { code: CODE, from: problem.range.start.offset, title: problem.fixes![0]!.title };
};

describe('fixEdits', () => {
  it('applies the fresh analysis without parsing again', () => {
    const { state, result } = analysed(text);
    expect(isFresh(state)).toBe(true);
    const spy = vi.fn(parse);
    const edits = fixEdits(state, target(result), spy);
    expect(spy).not.toHaveBeenCalled();
    expect(edits).toEqual(result.problems.find((p) => p.code === CODE)!.fixes![0]!.edits);

    const fixed = state.update({ changes: edits! }).state.doc.toString();
    expect(fixed).toContain('> [!riquadro] Se il tempo stringe\n> ');
    expect(parse(fixed).problems.some((p) => p.code === CODE)).toBe(false);
  });

  it('finds the problem again in a new parse when the text changed', () => {
    const { state, result } = analysed(text);
    const before = target(result);
    // Typing above the problem moves it; the analysis is now stale.
    const at = text.indexOf('## Scene');
    const typed = state.update({ changes: { from: at, insert: 'Una riga in più.\n\n' } }).state;
    expect(isFresh(typed)).toBe(false);
    // The position lint hands the action: the diagnostic's start, mapped.
    const moved = { ...before, from: before.from + 'Una riga in più.\n\n'.length };
    const spy = vi.fn(parse);
    const edits = fixEdits(typed, moved, spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(edits).not.toBeNull();
    // The edits are for the current text, not the analysed one.
    expect(edits![0]!.from).toBe(moved.from);
    const fixed = typed.update({ changes: edits! }).state.doc.toString();
    expect(fixed).toContain('> [!riquadro] Se il tempo stringe');
    expect(fixed).toContain('Una riga in più.');
  });

  it('applies nothing when the problem is gone from the current text', () => {
    const { state, result } = analysed(text);
    const before = target(result);
    // The user fixed it by hand: the field now has its label.
    const label = text.indexOf('**Se il tempo stringe') + 2;
    const typed = state.update({
      changes: { from: label, to: label + 'Se il tempo stringe'.length, insert: 'Prove e regole' },
    }).state;
    expect(fixEdits(typed, before)).toBeNull();
  });

  it('applies nothing to a campaign', () => {
    const state = EditorState.create({ doc: text, extensions: analysis({ checked: false, connect: fail }) });
    expect(fixEdits(state, { code: CODE, from: 0, title: 'x' })).toBeNull();
  });
});

describe('the analysis field', () => {
  it('maps the places through the edits made after the result', () => {
    const { state, result } = analysed(text);
    const s2 = result.model.scenes[1]!.headingRange.start.offset;
    const typed = state.update({ changes: { from: 0, insert: 'xyz' } }).state;
    const places = typed.field(analysisField).places;
    expect(places.find((p) => p.kind === 'scene' && p.index === 1)!.head).toBe(s2 + 3);
  });

  it('maps a late result through the edits made while it was computed', () => {
    let state = EditorState.create({ doc: text, extensions: analysis({ checked: true, connect: fail }) });
    const sent = state.doc;
    const result = parse(sent.toString());
    const typing = state.update({ changes: { from: 0, insert: 'ab' } });
    state = typing.state;
    state = state.update({ effects: setAnalysis.of({ doc: sent, result, changes: typing.changes }) }).state;
    expect(isFresh(state)).toBe(false);
    const value = state.field(analysisField);
    expect(value.doc).toBe(sent);
    const s1 = result.model.scenes[0]!.headingRange.start.offset;
    expect(value.places.find((p) => p.kind === 'scene' && p.index === 0)!.head).toBe(s1 + 2);
    expect(value.spots[0]!.from).toBe(result.problems[0]!.range.start.offset + 2);
  });
});
