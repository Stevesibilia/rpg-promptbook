import { Link } from 'react-router';
import type { BoardRow } from 'promptbook-project';
import { WarningIcon } from '../ui/icons.js';
import { useBoardContext } from './context.js';
import { ImageHalf } from './ImageHalf.js';
import { MusicHalf } from './MusicHalf.js';
import { scenePath } from './parts.js';
import { dims, type Filter } from './summary.js';

// One scene's card: its id, title and link, then the two halves.
export function SceneRow({ row, filter }: { row: BoardRow; filter: Filter }) {
  const { projectId } = useBoardContext();
  return (
    <article className="card scene" id={`row-${row.sceneId}`}>
      <div className="sh">
        <span className="sid">{row.sceneId}</span>
        <span className="stt">{row.title}</span>
        <Link className="go" to={scenePath(projectId, row.sceneId)}>
          Open the scene in the document
        </Link>
      </div>
      {row.duplicateTitle && (
        <div className="dup" role="note">
          <WarningIcon className="ic" />
          Another scene has this title, so its tracks cannot match. Give each scene its own title.
        </div>
      )}
      <div className="halves">
        <ImageHalf row={row} dim={dims(row.imageStatus, filter)} />
        <MusicHalf row={row} dim={dims(row.musicStatus, filter)} />
      </div>
    </article>
  );
}
