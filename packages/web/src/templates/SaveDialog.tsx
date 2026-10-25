import { useState } from 'react';
import type { Template, TemplateChange } from 'promptbook-format';
import { ApiError } from '../api.js';
import { Modal } from '../ui/Modal.js';
import { ChangeList, useReturnFocus } from './ChangeList.js';

const projects = (n: number) => `${n} project${n === 1 ? '' : 's'}`;

// «Save <name> vN» (mockup state 7): the changes since the saved version, an
// optional note, and what happens to the projects on it. Another tab or
// device may have saved first: the server refuses with
// template_version_conflict, and the dialog offers to reload.
export function SaveDialog({
  name,
  base,
  changes,
  to,
  onBase,
  onSave,
  onReload,
  onClose,
}: {
  name: string;
  // The version the draft started from.
  base: number;
  changes: readonly TemplateChange[];
  to: Template;
  // The projects on the version the draft started from.
  onBase: number;
  onSave(note: string): Promise<void>;
  onReload(): Promise<void>;
  onClose(): void;
}) {
  useReturnFocus();
  const next = base + 1;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(note.trim());
    } catch (e) {
      if (e instanceof ApiError && e.code === 'template_version_conflict') setConflict(true);
      else setError(e instanceof ApiError ? e.message : 'Saving failed.');
      setBusy(false);
    }
  };
  const reload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onReload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Reading the template again failed.');
      setBusy(false);
    }
  };

  if (conflict) {
    return (
      <Modal
        title={`${name} changed`}
        className="sm"
        onClose={onClose}
        footer={
          <>
            <button className="tb line" onClick={onClose}>
              Cancel
            </button>
            <button className="tb primary" autoFocus disabled={busy} onClick={() => void reload()}>
              Reload
            </button>
          </>
        }
      >
        <p role="alert">
          A newer version was saved in another tab or on another device while you edited v{base}. Reload to edit the
          latest version; your changes here are lost.
        </p>
        {error && <p className="err">{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal
      title={`Save ${name} v${next}`}
      className="sm"
      onClose={onClose}
      footer={
        <>
          <button className="tb line" onClick={onClose}>
            Cancel
          </button>
          <button className="tb primary" disabled={busy} onClick={() => void save()}>
            Save v{next}
          </button>
        </>
      }
    >
      <ChangeList changes={changes} to={to} />
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label htmlFor="tpl-note">Note for this version (optional)</label>
        <input
          id="tpl-note"
          autoFocus
          placeholder="e.g. Atmosfera on the night page"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
      </form>
      <p>
        {onBase
          ? `${projects(onBase)} use${onBase === 1 ? 's' : ''} v${base}. They keep it; each shows «v${next} available» in its top bar.`
          : 'No project uses this version.'}{' '}
        New projects start from v{next}.
      </p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
