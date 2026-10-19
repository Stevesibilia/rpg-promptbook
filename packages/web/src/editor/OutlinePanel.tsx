import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { keyLabel, shortcut } from './cm/keymap.js';
import { sceneMove, type MoveTarget } from './moveScene.js';
import { currentItem, outlineOf, type OutlineItem } from './outline.js';
import type { UpdateSource } from './StatusBar.js';
import { applyMove, jumpTo } from './writes.js';

interface Snapshot {
  items: readonly OutlineItem[];
  current: string | null;
}

const snapshotOf = (state: EditorState): Snapshot => ({
  items: outlineOf(state),
  current: currentItem(state)?.key ?? null,
});

// Positions the outline holds on to across edits, its own and other tabs':
// the scene being dragged, the one it would drop next to, and the one to
// keep the keyboard focus on after a move. Mapped like the analysis places.
interface Held {
  drag: number | null;
  drop: { head: number; after: boolean } | null;
  focus: number | null;
}

// The outline (design decisions 6 and 7): click to jump, the current item
// highlighted, scenes moved by dragging their handle or with Alt+↑ and Alt+↓.
export function Outline({ view, updates }: { view: EditorView | null; updates: UpdateSource }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dropAt, setDropAt] = useState<{ key: string; after: boolean } | null>(null);
  const held = useRef<Held>({ drag: null, drop: null, focus: null });
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!view) return setSnapshot(null);
    setSnapshot(snapshotOf(view.state));
    return updates((update) => {
      if (update.docChanged) {
        const map = (pos: number) => update.changes.mapPos(pos, -1);
        const h = held.current;
        if (h.drag !== null) h.drag = map(h.drag);
        if (h.drop) h.drop = { ...h.drop, head: map(h.drop.head) };
        if (h.focus !== null) h.focus = map(h.focus);
      }
      const next = snapshotOf(update.state);
      setSnapshot((current) =>
        current && current.items === next.items && current.current === next.current ? current : next,
      );
    });
  }, [view, updates]);

  // After a move, the keyboard focus follows the moved scene once the outline
  // shows it where it now is.
  useLayoutEffect(() => {
    const head = held.current.focus;
    if (head === null || !list.current?.contains(document.activeElement)) return;
    const li = list.current.querySelector<HTMLElement>(`li[data-head="${head}"][data-movable]`);
    if (li && li !== document.activeElement) li.focus();
  }, [snapshot]);

  if (!snapshot || !view) return null;

  function move(head: number, target: MoveTarget): boolean {
    const result = view && sceneMove(view.state, head, target);
    if (!view || !result) return false;
    applyMove(view, result);
    held.current.focus = result.head;
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, item: OutlineItem) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      jumpTo(view!, item.head);
      return;
    }
    if (!item.movable || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    // The focused scene, followed through the move just made even while the
    // outline still shows the order before it.
    const head = held.current.focus ?? item.head;
    move(head, { by: event.key === 'ArrowUp' ? -1 : 1 });
  }

  function onDragOver(event: DragEvent<HTMLLIElement>, item: OutlineItem) {
    const drag = held.current.drag;
    if (drag === null || !item.movable) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const box = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    held.current.drop = item.head === drag ? null : { head: item.head, after };
    setDropAt((d) =>
      item.head === drag ? null : d?.key === item.key && d.after === after ? d : { key: item.key, after },
    );
  }

  function endDrag() {
    held.current.drag = null;
    held.current.drop = null;
    setDropAt(null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const { drag, drop } = held.current;
    endDrag();
    if (drag !== null && drop) move(drag, drop);
  }

  return (
    <ul
      className="ol"
      ref={list}
      onBlur={(event) => {
        if (!list.current?.contains(event.relatedTarget as Node | null)) held.current.focus = null;
      }}
    >
      {snapshot.items.map((item) => (
        <li
          key={item.key}
          tabIndex={0}
          data-head={item.head}
          data-movable={item.movable || undefined}
          title={item.movable ? `${item.place} · drag, or Alt+↑ and Alt+↓, to move` : item.place}
          className={[
            item.depth ? 'sub' : '',
            item.key === snapshot.current ? 'cur' : '',
            dropAt?.key === item.key ? (dropAt.after ? 'drop-after' : 'drop-before') : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => jumpTo(view, item.head)}
          onFocus={() => {
            if (item.movable && held.current.focus !== item.head) held.current.focus = null;
          }}
          onKeyDown={(e) => onKeyDown(e, item)}
          onDragOver={(e) => onDragOver(e, item)}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setDropAt((d) => (d?.key === item.key ? null : d));
          }}
          onDrop={onDrop}
        >
          {item.movable ? (
            <span
              className="grip"
              draggable
              aria-hidden="true"
              onClick={(e) => e.stopPropagation()}
              onDragStart={(e) => {
                held.current.drag = item.head;
                e.dataTransfer.effectAllowed = 'move';
                // Not text/plain: dropped on the editor, it would be typed in.
                e.dataTransfer.setData('application/x-promptbook-scene', item.id ?? item.name);
                e.dataTransfer.setDragImage(e.currentTarget.parentElement!, 8, 8);
              }}
              onDragEnd={endDrag}
            >
              ⠿
            </span>
          ) : (
            // Keeps the names in line with the scenes'.
            <span className="grip" aria-hidden="true" />
          )}
          {item.id && <span className="id">{item.id}</span>}
          <span className="nm">{item.name}</span>
          {item.badge && (
            <span
              className={`badge ${item.badge.severity === 'error' ? 'err' : 'warn'}`}
              title={`${item.badge.count} problem${item.badge.count === 1 ? '' : 's'}`}
            >
              {item.badge.count}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OutlinePanel({ view, updates }: { view: EditorView | null; updates: UpdateSource }) {
  return (
    <nav className="outline" aria-label="Outline">
      <div className="panel-h">
        Outline <span className="kbd">{keyLabel(shortcut('outline').keys)}</span>
      </div>
      <Outline view={view} updates={updates} />
    </nav>
  );
}
