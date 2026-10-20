import { useEffect } from 'react';
import { platform } from '../platform/index.js';
import { useStore } from '../platform/hooks.js';
import { registry } from '../sync/registry.js';
import { hashBytes } from './hash.js';
import { Intake, type IntakeState } from './intake.js';
import { probe } from './probe.js';

// One intake per project for the page's life, so a batch outlives the board
// it was dropped on, and the board shown again finds it running.
const intakes = new Map<string, Intake>();

export function intakeFor(projectId: string): Intake {
  let intake = intakes.get(projectId);
  if (!intake) {
    intake = new Intake(projectId, {
      where: platform.kind === 'web' ? 'browser' : 'desktop',
      putFile: (id, sha256, bytes, mime) => platform.putFile(id, sha256, bytes, mime),
      hash: (bytes) => hashBytes(bytes),
      probe,
      open: (id) => registry.open(id).doc,
      release: (id) => registry.release(id),
    });
    intakes.set(projectId, intake);
  }
  return intake;
}

// On the desktop, signing out or opening another account lets the documents
// go without destroying them (desktopRegistry.closeAll), so no 'destroy'
// reaches an intake. The account's store changes first: the intakes stop
// then, so none writes to a let-go document or later releases the open of a
// board shown since.
const desktop = platform.desktop;
if (desktop) {
  let account = desktop.auth.get().account?.id ?? null;
  desktop.auth.subscribe(() => {
    const next = desktop.auth.get().account?.id ?? null;
    if (next === account) return;
    account = next;
    for (const intake of intakes.values()) intake.dispose();
    intakes.clear();
  });
}

// In the browser, closing the tab during an upload asks first: the files
// not yet uploaded would not reach the project.
function guard(event: BeforeUnloadEvent) {
  if ([...intakes.values()].some((i) => i.state.working)) event.preventDefault();
}
if (typeof window !== 'undefined' && platform.kind === 'web') window.addEventListener('beforeunload', guard);

// The board's intake and its state; leaving the board clears its marks.
export function useIntake(projectId: string): [Intake, IntakeState] {
  const intake = intakeFor(projectId);
  const state = useStore(intake.store);
  useEffect(() => () => intake.left(), [intake]);
  return [intake, state];
}
