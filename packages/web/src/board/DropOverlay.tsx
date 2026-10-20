import { useEffect, useRef, useState } from 'react';
import { DropIcon } from '../ui/icons.js';

export interface DragCount {
  files: number;
  images: number;
  tracks: number;
}

// While files are dragged, what they are by MIME type: the names are not
// known before the drop.
export function countItems(items: DataTransferItemList | readonly { kind: string; type: string }[]): DragCount {
  const count = { files: 0, images: 0, tracks: 0 };
  for (const item of Array.from(items as ArrayLike<{ kind: string; type: string }>)) {
    if (item.kind !== 'file') continue;
    count.files += 1;
    if (item.type.startsWith('image/')) count.images += 1;
    else if (item.type.startsWith('audio/')) count.tracks += 1;
  }
  return count;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// «14 files · 10 images, 4 tracks».
export function countLine({ files, images, tracks }: DragCount): string {
  const kinds = [
    ...(images ? [plural(images, 'image', 'images')] : []),
    ...(tracks ? [plural(tracks, 'track', 'tracks')] : []),
  ];
  return kinds.length > 0 ? `${plural(files, 'file', 'files')} · ${kinds.join(', ')}` : plural(files, 'file', 'files');
}

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

// Drop anywhere on the window while the board is open (asset-board design
// decision 12), with a depth counter as the mockup's script. When `enabled`
// is false (the empty state) a drop does nothing, but the browser still does
// not open the file in place of the app.
export function useWindowDrop(enabled: boolean, onDrop: (files: File[]) => void): DragCount | null {
  const [count, setCount] = useState<DragCount | null>(null);
  const latest = useRef({ enabled, onDrop });
  latest.current = { enabled, onDrop };

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (!latest.current.enabled) return;
      depth += 1;
      setCount(countItems(e.dataTransfer!.items));
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = latest.current.enabled ? 'copy' : 'none';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        setCount(null);
      }
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setCount(null);
      if (latest.current.enabled) latest.current.onDrop(Array.from(e.dataTransfer!.files));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return enabled ? count : null;
}

// Screen 4.
export function DropOverlay({ count }: { count: DragCount }) {
  return (
    <div className="dropov" aria-hidden="true">
      <div className="zone">
        <div>
          <DropIcon className="ic" />
          <h2>Drop images and tracks</h2>
          <p>They find their scene by filename.</p>
          <p className="hint">Files that match nothing wait in Unmatched.</p>
          <div className="cnt">{countLine(count)}</div>
        </div>
      </div>
    </div>
  );
}
