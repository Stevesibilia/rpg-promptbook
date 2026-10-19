import { Link } from 'react-router';
import { currentSeed } from 'promptbook-project';
import type * as Y from 'yjs';
import { useDocValue } from '../sync/hooks.js';
import { Section } from './InspectorSection.js';

// The current seed, read-only; it is edited in the project panel.
export function SeedView({
  doc,
  projectId,
  open,
  onToggle,
}: {
  doc: Y.Doc;
  projectId: string;
  open: boolean;
  onToggle(open: boolean): void;
}) {
  const seed = useDocValue(doc, currentSeed);
  return (
    <Section className="seed-section" open={open} onToggle={onToggle} summary="Seed">
      {seed ? <div className="seed">{seed}</div> : <p className="hint">No seed yet.</p>}
      <Link className="edit-seed" to={`/?p=${projectId}`} title="Edit the seed in the project panel">
        Edit
      </Link>
    </Section>
  );
}
