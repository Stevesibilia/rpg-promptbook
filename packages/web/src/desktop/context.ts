import { createContext, useContext } from 'react';

// What the desktop's frame offers the components it shows: a toast that
// outlives the page that asked for it, and the sign-out dialog.
export interface DesktopUi {
  toast(message: string): void;
  openSignOut(): void;
}

export const DesktopContext = createContext<DesktopUi | null>(null);

export function useDesktopUi(): DesktopUi {
  const ui = useContext(DesktopContext);
  if (!ui) throw new Error('useDesktopUi outside the desktop app');
  return ui;
}
