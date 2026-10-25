import { useMemo, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { resolveTemplate, templateChanges, type Template } from 'promptbook-format';
import { updateEdits, type ProjectMeta } from 'promptbook-project';
import type * as Y from 'yjs';
import { applyTemplateUpdate, undoManagerOf } from '../editor/undo.js';
import { Modal } from '../ui/Modal.js';
import { useReturnFocus } from '../ui/focus.js';
import { ChangeList } from './ChangeList.js';
import { latestVersions } from './list.js';
import { useTemplates } from './TemplatesContext.js';
import { checksAfter, checksText, updatePlan } from './update.js';
import './templates.css';

// «<name> vK · vN available» in the project's top bar when its template has
// a newer version (mockup state 8); nothing otherwise. It opens the update
// dialog.
export function TemplateUpdate({ doc, meta, view }: { doc: Y.Doc; meta: ProjectMeta; view: EditorView | null }) {
  const { templates, stored } = useTemplates();
  const [open, setOpen] = useState(false);
  const from = resolveTemplate(meta.template, templates);
  const latest = latestVersions(stored).get(meta.template.id)?.body;
  if (!from || !latest || latest.version <= from.version || latest.kind !== from.kind) return null;
  return (
    <>
      <button
        className="tpl-chip"
        title="Template of this project; a newer version is available"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {from.name} v{from.version} · v{latest.version} available
      </button>
      {open && (
        <UpdateDialog
          doc={doc}
          from={from}
          to={latest}
          onClose={() => setOpen(false)}
          onUpdated={() => {
            setOpen(false);
            view?.focus();
          }}
        />
      )}
    </>
  );
}

function UpdateDialog({
  doc,
  from,
  to,
  onClose,
  onUpdated,
}: {
  doc: Y.Doc;
  from: Template;
  to: Template;
  onClose(): void;
  onUpdated(): void;
}) {
  useReturnFocus();
  const changes = useMemo(() => templateChanges(from, to), [from, to]);
  const plan = useMemo(() => updatePlan(from, to), [from, to]);
  const [addSections, setAddSections] = useState(plan.added.length > 0);
  const [renameHeadings, setRenameHeadings] = useState(plan.renamed.length > 0);
  // The text as it is when the dialog opened, for the checks' preview; the
  // update itself reads it again.
  const [text] = useState(() => doc.getText('document').toString());
  const after = useMemo(
    () => checksAfter(text, from, to, updateEdits(text, from, to, { addSections, renameHeadings })),
    [text, from, to, addSections, renameHeadings],
  );

  const update = () => {
    const now = doc.getText('document').toString();
    const edits = updateEdits(now, from, to, { addSections, renameHeadings });
    applyTemplateUpdate(doc, undoManagerOf(doc), edits, to);
    onUpdated();
  };

  return (
    <Modal
      title={`Update to ${to.name} v${to.version}`}
      className="sm"
      onClose={onClose}
      footer={
        <>
          <button className="tb line" onClick={onClose}>
            Not now
          </button>
          <button className="tb primary" autoFocus onClick={update}>
            Update to v{to.version}
          </button>
        </>
      }
    >
      <p>
        This project uses v{from.version}. Updating changes the rules it is checked against; your text changes only where
        you tick below.
      </p>
      <ChangeList changes={changes} to={to} />
      {plan.added.length > 0 && (
        <label className="chk">
          <input type="checkbox" checked={addSections} onChange={(e) => setAddSections(e.target.checked)} />
          <span>
            Add the new sections' headings to the document
            {plan.added.map((a) => (
              <small key={a.heading}>
                «## {a.heading}» {a.after ? `after «${a.after}»` : 'at the start'}, empty
              </small>
            ))}
          </span>
        </label>
      )}
      {plan.renamed.length > 0 && (
        <label className="chk">
          <input type="checkbox" checked={renameHeadings} onChange={(e) => setRenameHeadings(e.target.checked)} />
          <span>
            Rename the headings that changed
            {plan.renamed.map((r) => (
              <small key={`${r.what}:${r.before}`}>
                {r.what === 'section' ? `«## ${r.before}» becomes «## ${r.after}»` : `«${r.before}» becomes «${r.after}» in the scenes`}
              </small>
            ))}
          </span>
        </label>
      )}
      {after && (
        <p data-testid="checks-after">
          After the update:{' '}
          <b className={after.errors > 0 || after.warnings > 0 ? 'worse' : ''}>{checksText(after)}</b>
          {after.fresh.length > 0 && `, ${after.fresh.slice(0, 2).join('; ')}${after.fresh.length > 2 ? '…' : ''}`}.
          Undo puts the document back.
        </p>
      )}
    </Modal>
  );
}
