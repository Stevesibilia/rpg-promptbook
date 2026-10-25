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
