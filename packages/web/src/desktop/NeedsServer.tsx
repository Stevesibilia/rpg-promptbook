import type { ReactNode } from 'react';
import { useOffline } from './useDevice.js';

// What only the server can do, while the desktop app is offline
// (desktop-app design decision 7): shown disabled with the hint «Needs the
// server». In the browser, and online, the children as they are.

export const NEEDS_SERVER = 'Needs the server';

// Around one control, which the caller disables with useOffline().
export function NeedsServer({ children }: { children: ReactNode }) {
  const offline = useOffline();
  if (!offline) return <>{children}</>;
  return (
    <span className="needs" data-tip={NEEDS_SERVER}>
      {children}
    </span>
  );
}

// Around a group of fields that save to the server: all disabled, with the
// hint above them.
export function NeedsServerGroup({ children }: { children: ReactNode }) {
  const offline = useOffline();
  if (!offline) return <>{children}</>;
  return (
    <fieldset className="needs-group" disabled>
      <p className="needs-line">{NEEDS_SERVER}</p>
      {children}
    </fieldset>
  );
}
