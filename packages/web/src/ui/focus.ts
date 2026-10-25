import { useEffect, useState } from 'react';

// Gives the focus back to what had it when a dialog opened, once it closes.
// The opener is read while the dialog first renders, before an autoFocus
// inside it takes the focus.
export function useReturnFocus(): void {
  const [opener] = useState(() => document.activeElement);
  useEffect(
    () => () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    },
    [opener],
  );
}
