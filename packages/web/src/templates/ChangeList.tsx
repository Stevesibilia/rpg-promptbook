import { useEffect, useRef } from 'react';
import type { Template, TemplateChange } from 'promptbook-format';
import { changeText, kindLabel } from './changes.js';

// The list of changes the save and update dialogs show: Added, Changed,
// Removed, one line each.
export function ChangeList({ changes, to }: { changes: readonly TemplateChange[]; to: Template }) {
  return (
    <ul className="chg" aria-label="Changes">
      {changes.map((change, i) => (
        <li key={i}>
          <span className={`k ${change.kind}`}>{kindLabel[change.kind]}</span>
          <span>{changeText(change, to)}</span>
        </li>
      ))}
    </ul>
  );
}

// Gives the focus back to what had it when a dialog opened, once it closes.
export function useReturnFocus() {
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    opener.current = document.activeElement;
    return () => {
      const element = opener.current;
      if (element instanceof HTMLElement && element.isConnected) element.focus();
    };
  }, []);
}
