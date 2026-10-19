import { Link } from 'react-router';
import { currentSeed } from 'promptbook-project';
import type * as Y from 'yjs';
import { projectPath } from '../project/top.js';
import { useDocValue } from '../sync/hooks.js';
import { Section } from './InspectorSection.js';

// The current seed, read-only; it is edited in the Inspiration view.
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
      <Link className="edit-seed" to={projectPath(projectId, 'inspiration')} title="Edit the seed in Inspiration">
        Edit
      </Link>
    </Section>
  );
}
