import { useEffect } from 'react';
import { platform } from '../platform/index.js';

// The desktop window's title: «<project title> · Promptbook» on a project,
// «Promptbook» elsewhere (main copies document.title). The browser's tab
// title is left as it was.
export function useWindowTitle(title: string): void {
  useEffect(() => {
    if (platform.kind !== 'desktop') return;
    document.title = `${title || 'Untitled project'} · Promptbook`;
    return () => {
      document.title = 'Promptbook';
    };
  }, [title]);
}
