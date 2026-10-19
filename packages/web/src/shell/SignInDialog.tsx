import { Modal } from '../ui/Modal.js';
import { SignInForm } from '../auth/SignInForm.js';
import type { User } from '../api.js';

// Signing in again over the current page, so what this tab has not sent stays
// in it and goes to the server once the new session connects.
export function SignInDialog({
  username,
  onClose,
  onSignedIn,
}: {
  username: string;
  onClose(): void;
  onSignedIn(user: User): void;
}) {
  return (
    <Modal title="Sign in to sync" onClose={onClose} className="confirm">
      <p className="dialog-lead">Your session ended. Sign in again: changes in this tab are sent once you are back.</p>
      <SignInForm initialUsername={username} onSignedIn={onSignedIn} />
    </Modal>
  );
}
