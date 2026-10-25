import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal.js';

// A question before an action that changes or removes something, as the
// mockup's shared confirm: the text, a muted note, Cancel and the action.
// The action may run a request; it closes the dialog when it succeeds and
// shows its error otherwise.
export function Confirm({
  title,
  children,
  note,
  action,
  danger = false,
  focusCancel = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  note?: ReactNode;
  action: string;
  danger?: boolean;
  // Cancel takes the focus when the dialog opens.
  focusCancel?: boolean;
  onConfirm(): void | Promise<void>;
  onClose(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      if (alive.current) onClose();
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error && e.message ? e.message : 'That did not work.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      className="confirm"
      footer={
        <>
          <button className="tb line" autoFocus={focusCancel} onClick={onClose}>
            Cancel
          </button>
          <button className={`tb ${danger ? 'danger-fill' : 'primary'}`} disabled={busy} onClick={() => void run()}>
            {action}
          </button>
        </>
      }
    >
      <p style={{ margin: '0 0 8px' }}>{children}</p>
      {note && <p style={{ margin: 0, color: 'var(--muted)' }}>{note}</p>}
      {error && (
        <p className="err" role="alert" style={{ margin: '10px 0 0' }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
