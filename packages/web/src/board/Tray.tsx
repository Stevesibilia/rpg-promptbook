import { removeFile } from 'promptbook-project';
import { MusicIcon, WarningIcon } from '../ui/icons.js';
import { ActionSelect } from './ActionSelect.js';
import { assignFromTray } from './actions.js';
import { useBoardContext } from './context.js';
import { FileImage } from './parts.js';
import { duration, sceneLabel, shortName } from './summary.js';
import type { TrayFile } from './useBoard.js';

// Unmatched (screen 5): pinned above the rows while the board scrolls. A file
// leaves it by being assigned to a scene, or removed at once.
export function Tray({ files, onHelp }: { files: TrayFile[]; onHelp(): void }) {
  const { doc, projectId, rows, toast, mark } = useBoardContext();
  if (files.length === 0) return null;
  return (
    <section className="card tray" aria-label="Unmatched">
      <div className="th">
        <WarningIcon className="ic" />
        <b>Unmatched</b>
        <span className="cnt">
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </span>
        <span className="hint">Their names match no prompt or track title.</span>
        <span className="spacer" />
        <button className="tb xs" onClick={onHelp}>
          How matching works
        </button>
      </div>
      <div className="list">
        {files.map(({ file, reason }) => {
          const kind = file.kind === 'image' ? 'Image' : ['Track', duration(file.duration)].filter(Boolean).join(' · ');
          return (
            <div className="uf" key={file.id}>
              {file.kind === 'image' ? (
                <FileImage className="mini" projectId={projectId} file={file} />
              ) : (
                <span className="trk">
                  <MusicIcon className="ic" />
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <div className="fn">{file.name}</div>
                <div className="why">{reason ? `${kind} · ${reason}` : kind}</div>
              </div>
              <div className="uact">
                <ActionSelect
                  label={`Assign ${file.name} to a scene`}
                  placeholder="Assign to scene…"
                  options={rows.map((r) => ({ value: r.sceneId, label: sceneLabel(r) }))}
                  onPick={(to) => {
                    const said = assignFromTray(doc, rows, file.id, to);
                    if (said) {
                      mark(file.id);
                      toast(said);
                    }
                  }}
                />
                <button
                  className="tb sm danger"
                  onClick={() => {
                    removeFile(doc, file.id);
                    toast(`Removed ${shortName(file.name)}.`);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
