import type { Template, TextEdit } from 'promptbook-format';
import { setTemplate } from 'promptbook-project';
import * as Y from 'yjs';

// The editor's undo history (template-editor design decisions 10 and 18). It
// tracks the document's text, as before, and the project's meta map only for
// the transaction that updates the project to another template version: one
// undo then restores both the text and the version. Every other meta write
// (title, status, campaign) stays out of the history, as it always was.

// The origin of the update's transaction.
export const templateUpdateOrigin = Symbol('template update');

// The undo manager of the editor open on a document, for the update dialog.
const managers = new WeakMap<Y.Doc, Y.UndoManager>();
export const undoManagerOf = (doc: Y.Doc): Y.UndoManager | undefined => managers.get(doc);

export function editorUndoManager(doc: Y.Doc): Y.UndoManager {
  const text = doc.getText('document');
  const meta = doc.getMap('meta');
  // As the transaction's map of changed types keys it.
  const metaType = meta as unknown as Y.AbstractType<Y.YEvent<Y.AbstractType<unknown>>>;
  // An undo or a redo of the update is the manager's own transaction: it
  // must be captured too, or the update could not be redone.
  const undoManager: Y.UndoManager = new Y.UndoManager([text, meta], {
    captureTransaction: (transaction) =>
      transaction.origin === templateUpdateOrigin ||
      transaction.origin === undoManager ||
      !transaction.changedParentTypes.has(metaType),
  });
  undoManager.addTrackedOrigin(templateUpdateOrigin);
  managers.set(doc, undoManager);
  return undoManager;
}

// The editor closed: its history goes with it.
export function destroyEditorUndoManager(doc: Y.Doc, undoManager: Y.UndoManager): void {
  if (managers.get(doc) === undoManager) managers.delete(doc);
  undoManager.destroy();
}

// Applies the update's text edits and records the new version in one
// transaction, kept apart from the typing before and after it, so it is one
// undo step. `edits` are positions in the text as it is now. Without an
// editor open on the document, there is no history to keep it in.
export function applyTemplateUpdate(
  doc: Y.Doc,
  undoManager: Y.UndoManager | undefined,
  edits: readonly TextEdit[],
  to: Pick<Template, 'id' | 'version'>,
): void {
  const text = doc.getText('document');
  undoManager?.stopCapturing();
  doc.transact(() => {
    // From the end, so each edit's positions still hold.
    for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
      if (edit.to > edit.from) text.delete(edit.from, edit.to - edit.from);
      if (edit.insert) text.insert(edit.from, edit.insert);
    }
    setTemplate(doc, { id: to.id, version: to.version });
  }, templateUpdateOrigin);
  undoManager?.stopCapturing();
}
