import { MusicIcon, WarningIcon } from '../ui/icons.js';
import { ActionSelect } from './ActionSelect.js';
import { assignImageFromTray, assignTrackFromTray, matchAgain, matchAgainToast, removeFromTray } from './actions.js';
import { useBoardContext } from './context.js';
import { FileImage } from './parts.js';
import { duration, joinAnd, promptGroups, promptLabel, sceneLabel } from './summary.js';
import type { TrayFile } from './useBoard.js';

// Unmatched (screen 5): pinned above the tab's content while the board
// scrolls, on every tab. A file leaves it by being assigned to a prompt or a
// scene, or removed at once. An image whose name matches several prompts
// names them, and its menu lists them first.
export function Tray({ files, onHelp }: { files: TrayFile[]; onHelp(): void }) {
  const { doc, projectId, rows, shown, toast, mark } = useBoardContext();
  if (files.length === 0) return null;
  const sceneIds = rows.map((r) => r.sceneId);
  return (
    <section className="card tray" aria-label="Unmatched">
      <div className="th">
        <WarningIcon className="ic" />
        <b>Unmatched</b>
        <span className="cnt">
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </span>
        <span className="hint">Their names match no prompt or track title, or more than one prompt.</span>
        <span className="spacer" />
        <button
          className="tb xs line"
          title="Match the files again against the prompts and titles as they are now"
          onClick={() => {
            const assigned = matchAgain(doc, sceneIds);
            for (const id of assigned) mark(id);
            toast(matchAgainToast(assigned.length));
          }}
        >
          Match again
        </button>
        <button className="tb xs" onClick={onHelp}>
          How matching works
        </button>
      </div>
      <div className="list">
        {files.map(({ file, reason, candidates }) => {
          const image = file.kind === 'image';
          const kind = image ? 'Image' : ['Track', duration(file.duration)].filter(Boolean).join(' · ');
          // Candidates still shown as the tray is drawn.
          const matches = candidates.filter((id) => shown.has(id));
          return (
            <div className="uf" key={file.id}>
              {image ? (
                <FileImage className="mini" projectId={projectId} file={file} />
              ) : (
                <span className="trk">
                  <MusicIcon className="ic" />
                </span>
              )}
              <div style={{ minWidth: 0 }}>
                <div className="fn">{file.name}</div>
                <div className="why">
                  {matches.length > 1 ? (
                    <>
                      {kind} · <span className="amb">matches {matches.length} prompts</span>{' '}
                      {joinAnd(matches.map((id) => promptLabel(shown.get(id)!)))}. Pick one.
                    </>
                  ) : reason ? (
                    `${kind} · ${reason}`
                  ) : (
                    kind
                  )}
                </div>
              </div>
              <div className="uact">
                {image ? (
                  <ActionSelect
                    label={`Assign ${file.name} to a prompt`}
                    placeholder="Assign to prompt…"
                    options={promptGroups(shown, { first: matches.length > 1 ? matches : [] })}
                    onPick={(to) => {
                      const said = assignImageFromTray(doc, shown, sceneIds, file.id, to);
                      if (said) {
                        mark(file.id);
                        toast(said);
                      }
                    }}
                  />
                ) : (
                  <ActionSelect
                    label={`Assign ${file.name} to a scene`}
                    placeholder="Assign to scene…"
                    options={rows.map((r) => ({ value: r.sceneId, label: sceneLabel(r) }))}
                    onPick={(to) => {
                      const said = assignTrackFromTray(doc, rows, file.id, to);
                      if (said) {
                        mark(file.id);
                        toast(said);
                      }
                    }}
                  />
                )}
                <button
                  className="tb sm danger"
                  onClick={() => {
                    const said = removeFromTray(doc, sceneIds, file.id);
                    if (said) toast(said);
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
