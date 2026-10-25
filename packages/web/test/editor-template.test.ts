// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { defineTemplate, parseAdventure, templates, type AdventureTemplateInput } from 'promptbook-format';
import { describe, expect, it } from 'vitest';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import { analysisField } from '../src/editor/analysis/field.js';
import type { Connect, ParseRequest } from '../src/editor/analysis/client.js';
import { templateChange, templateCompartment, templateExtension, type TemplateParts } from '../src/editor/template-parts.js';

// A worker that parses at once, keeping each request's template.
function worker() {
  const sent: ParseRequest[] = [];
  const connect: Connect = (receive) => ({
    send(request) {
      sent.push(request);
      queueMicrotask(() =>
        receive({ version: request.version, result: parseAdventure(request.text, { template: request.template }) }),
      );
    },
    dispose() {},
  });
  return { sent, connect };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a template change in the editor', () => {
  it('reconfigures the view: the edits before it stay undoable, and the analysis uses the new template', async () => {
    const doc = new Y.Doc();
    const text = doc.getText('document');
    text.insert(0, '## Inizio forte\n\nTesto.\n');
    const undoManager = new Y.UndoManager(text);
    const { sent, connect } = worker();
    const parts: TemplateParts = { checked: true, connect };
    const compartment = templateCompartment();
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: text.toString(),
        extensions: [templateExtension(compartment, templates.avventura, parts), yCollab(text, null, { undoManager })],
      }),
    });
    await tick();
    expect(sent.at(-1)?.template).toBe(templates.avventura);

    // An edit typed in the editor, then the project moves to v2.
    view.dispatch({ changes: { from: text.length, insert: 'Altro.\n' } });
    expect(text.toString()).toContain('Altro.');
    const definition = JSON.parse(JSON.stringify(templates.avventura)) as AdventureTemplateInput;
    definition.id = 't-kulthos0001';
    definition.sections.find((s) => s.role === 'strongStart')!.name = 'Apertura';
    const v2 = defineTemplate(definition);
    view.dispatch(templateChange(compartment, v2, parts));
    expect(view.state.field(analysisField).template).toBe(v2);
    expect(view.state.field(analysisField).result).toBeNull();
    await tick();
    expect(sent.at(-1)?.template).toBe(v2);
    expect(view.state.field(analysisField).result).not.toBeNull();

    // The same view and undo manager: the edit before the change undoes.
    undoManager.undo();
    expect(text.toString()).toBe('## Inizio forte\n\nTesto.\n');
    expect(view.state.doc.toString()).toBe('## Inizio forte\n\nTesto.\n');
    view.destroy();
  });
});
