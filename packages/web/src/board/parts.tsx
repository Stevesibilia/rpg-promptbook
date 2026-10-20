import { useState } from 'react';
import { Link } from 'react-router';
import type { Author, FileEntry, HalfStatus } from 'promptbook-project';
import { relativeTime } from '../dates.js';
import { projectPath } from '../project/top.js';
import { platform } from '../platform/index.js';
import { useDownloadsVersion } from './device.js';
import { statusLabels } from './summary.js';

// Small parts the halves, the tray and the viewer share.

export const scenePath = (projectId: string, sceneId: string) =>
  `${projectPath(projectId)}?scene=${encodeURIComponent(sceneId)}`;

export function StatusChip({ status }: { status: HalfStatus }) {
  return (
    <span className={`st ${status}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}

// «visual: <text> Edit in the document», or «visual: empty».
export function SourceLine({
  label,
  text,
  projectId,
  sceneId,
}: {
  label: 'visual' | 'mood';
  text: string | null;
  projectId: string;
  sceneId: string;
}) {
  return (
    <div className={`srcline${text ? '' : ' blank'}`}>
      <span className="k">{label}:</span>
      {text || 'empty'}
      <Link to={scenePath(projectId, sceneId)}>Edit in the document</Link>
    </div>
  );
}

// «by Claude · 5 min ago», «edited by you · yesterday».
export function Provenance({ by, at }: { by: Author; at: string }) {
  const when = at ? ` · ${relativeTime(at)}` : '';
  return (
    <span className="prov">
      {by === 'claude' ? (
        <>
          by <span className="who-cl">Claude</span>
          {when}
        </>
      ) : (
        <>
          edited by <span className="who-you">you</span>
          {when}
        </>
      )}
    </span>
  );
}

// A file's picture: its thumbnail, or the original when it has none. A file
// whose bytes are not there yet (uploaded later by a desktop) is an empty
// tile, with no text; on the desktop it is asked for again once a download
// ends.
export function FileImage({
  projectId,
  file,
  full = false,
  className,
}: {
  projectId: string;
  file: FileEntry;
  full?: boolean;
  className?: string;
}) {
  const sha = full ? file.sha256 : (file.thumbSha256 ?? file.sha256);
  const attempt = `${sha}:${useDownloadsVersion()}`;
  const [broken, setBroken] = useState<string | null>(null);
  if (broken === attempt) return <span className={className} />;
  return (
    <img
      className={className}
      src={platform.fileUrl(projectId, sha)}
      alt=""
      loading={full ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setBroken(attempt)}
    />
  );
}
