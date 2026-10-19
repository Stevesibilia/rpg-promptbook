import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { Link } from 'react-router';
import { readNotes } from 'promptbook-project';
import type * as Y from 'yjs';
import { longDate } from '../dates.js';
import { projectPath } from '../project/top.js';
import { notesFor, type SceneText } from '../research/match.js';
import { useDocValue } from '../sync/hooks.js';
import { Section, useViewValue } from './InspectorSection.js';
import { currentItem } from './outline.js';
import type { UpdateSource } from './StatusBar.js';

const MAX_NOTES = 3;

// The scene holding the cursor, with its text as it is now.
function sceneOf(state: EditorState): SceneText | null {
  const item = currentItem(state);
  if (item?.kind !== 'scene') return null;
  return { id: item.id ?? `S${item.index + 1}`, text: state.doc.sliceString(item.from, item.to) };
}

const sameScene = (a: SceneText | null, b: SceneText | null) => a?.id === b?.id && a?.text === b?.text;

const quoted = (words: string[]) => words.map((w) => `«${w}»`).join(', ');

// The inspector's Research (connector design decision 14): the notes whose
// topic shares a word with the scene under the cursor, at most three.
export function ResearchSection({
  doc,
  projectId,
  view,
  updates,
  open,
  onToggle,
}: {
  doc: Y.Doc;
  projectId: string;
  view: EditorView | null;
  updates: UpdateSource;
  open: boolean;
  onToggle(open: boolean): void;
}) {
  const notes = useDocValue(doc, readNotes);
  const scene = useViewValue(view, updates, sceneOf, sameScene);
  const matches = scene ? notesFor(scene.text, notes, MAX_NOTES) : [];
  const research = projectPath(projectId, 'research');

  return (
    <Section
      className="research-section"
      open={open}
      onToggle={onToggle}
      summary={
        <>
          Research{' '}
          {scene && (
            <span className="cnt">
              {matches.length} for {scene.id}
            </span>
          )}
        </>
      }
    >
      {!scene ? (
        <p className="hint">Put the cursor in a scene to see its notes.</p>
      ) : matches.length === 0 ? (
        <p className="hint">{notes.length ? 'No note shares a word with this scene.' : 'No research notes yet.'}</p>
      ) : (
        matches.map(({ note, words }) => (
          <div className="note" key={note.id}>
            <b>{note.topic || 'Untitled note'}</b>
            <div className="meta">
              Matches {quoted(words)} · by {note.by === 'claude' ? 'Claude' : 'you'} · {longDate(note.editedAt)}
            </div>
            <div className="acts">
              <Link className="link" to={`${research}?note=${encodeURIComponent(note.id)}`}>
                Open
              </Link>
            </div>
          </div>
        ))
      )}
      <div className="hint research-hint">
        Notes whose topic shares words with this scene.{' '}
        <Link className="link" to={research}>
          All {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </Link>
      </div>
    </Section>
  );
}
