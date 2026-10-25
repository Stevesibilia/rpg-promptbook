// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { defineTemplate, templates, type AdventureTemplateInput } from 'promptbook-format';
import { createProjectDoc, readMeta, setStatus, setTitle, updateEdits } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import { applyTemplateUpdate, editorUndoManager } from '../src/editor/undo.js';

// Template-editor design decision 18: one undo restores the text and the
// template version the update changed, and nothing else in the meta map.

function kulthos(version: number, edit?: (d: AdventureTemplateInput) => void) {
  const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
  definition.id = 't-kulthos0001';
  definition.version = version;
  definition.name = 'Avventura Kulthos';
  edit?.(definition);
  return defineTemplate(definition);
}

const v2 = kulthos(2);
const v3 = kulthos(3, (d) => {
  d.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
  const truths = d.sections.findIndex((s) => s.role === 'truths');
  d.sections.splice(truths + 1, 0, { name: 'Atmosfera', requirement: 'optional', uid: 'u-atmosfera' });
});

const START = '## Verità del mondo\n\n- La città dorme.\n\n## Inizio forte\n\n> [!leggi]\n> La terra trema.\n';

function project() {
  const doc = createProjectDoc({
    id: 'p1',
    title: 'L’Ancora di Sabaoth',
    category: 'adventure',
    status: 'draft',
    campaignId: null,
    system: 'Kulthos',
    document: START,
    todo: [],
    template: { id: v2.id, version: v2.version },
  });
  const text = doc.getText('document');
  const undoManager = editorUndoManager(doc);
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: text.toString(), extensions: [yCollab(text, null, { undoManager })] }),
  });
  return { doc, text, undoManager, view };
}

describe('the editor undo history and a template update', () => {
  it('undoes the update in one step: the text and the version come back together', () => {
    const { doc, text, undoManager, view } = project();
    // Typing before the update, a step of its own.
    view.dispatch({ changes: { from: text.length, insert: '\nAltro.\n' } });
    const typed = text.toString();
    const edits = updateEdits(typed, v2, v3, { addSections: true, renameHeadings: true });
    expect(edits.length).toBeGreaterThan(0);

    applyTemplateUpdate(doc, undoManager, edits, v3);
    expect(text.toString()).toContain('## Apertura');
    expect(text.toString()).toContain('## Atmosfera');
    expect(view.state.doc.toString()).toBe(text.toString());
    expect(readMeta(doc).template).toEqual({ id: v3.id, version: 3 });

    undoManager.undo();
    expect(text.toString()).toBe(typed);
    expect(view.state.doc.toString()).toBe(typed);
    expect(readMeta(doc).template).toEqual({ id: v2.id, version: 2 });

    // The typing before it is the next step, not part of the update's.
    undoManager.undo();
    expect(text.toString()).toBe(START);

    // Redo brings both back.
    undoManager.redo();
    undoManager.redo();
    expect(text.toString()).toContain('## Apertura');
    expect(readMeta(doc).template).toEqual({ id: v3.id, version: 3 });
    view.destroy();
  });

  it('keeps other meta writes out of the history', () => {
    const { doc, text, undoManager, view } = project();
    setStatus(doc, 'complete');
    setTitle(doc, 'Altro titolo');
    expect(undoManager.undoStack).toHaveLength(0);

    view.dispatch({ changes: { from: 0, insert: 'x' } });
    setStatus(doc, 'draft');
    undoManager.undo();
    expect(text.toString()).toBe(START);
    // The status written after the typing stays.
    expect(readMeta(doc).status).toBe('draft');
    expect(readMeta(doc).title).toBe('Altro titolo');
    view.destroy();
  });

  it('a status write after the update is not undone with it', () => {
    const { doc, text, undoManager, view } = project();
    applyTemplateUpdate(doc, undoManager, updateEdits(text.toString(), v2, v3, { addSections: true, renameHeadings: true }), v3);
    setStatus(doc, 'complete');
    undoManager.undo();
    expect(readMeta(doc).template).toEqual({ id: v2.id, version: 2 });
    expect(readMeta(doc).status).toBe('complete');
    expect(text.toString()).toBe(START);
    view.destroy();
  });

  it('a remote update of the version is not undone from this tab', () => {
    const { doc, undoManager, view } = project();
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    remote.getMap('meta').set('template', { id: v3.id, version: 3 });
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'provider');
    expect(undoManager.undoStack).toHaveLength(0);
    expect(readMeta(doc).template).toEqual({ id: v3.id, version: 3 });
    view.destroy();
  });
});
