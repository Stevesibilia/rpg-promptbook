import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { EditorView } from '@codemirror/view';
import { keyLabel } from './cm/keymap.js';
import { useViewValue } from './InspectorSection.js';
import { outlineOf } from './outline.js';
import { filterEntries, paletteEntries, type PaletteAction } from './palette.js';
import type { UpdateSource } from './StatusBar.js';

const same = (a: unknown, b: unknown) => a === b;

// The command palette (design decision 10): a text field over the outline's
// items and the commands. The list follows the document while it is open;
// the highlighted row is held by its key, so a change elsewhere does not move
// it to another entry.
export function CommandPalette({
  view,
  updates,
  checked,
  onRun,
  onClose,
}: {
  view: EditorView | null;
  updates: UpdateSource;
  checked: boolean;
  onRun(action: PaletteAction): void;
  onClose(): void;
}) {
  const items = useViewValue(view, updates, outlineOf, same);
  const entries = useMemo(() => paletteEntries(items ?? [], { checked }), [items, checked]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const shown = useMemo(() => filterEntries(entries, query), [entries, query]);
  const index = Math.max(
    0,
    shown.findIndex((e) => e.key === selected),
  );
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, shown]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!shown.length) return;
      const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      setSelected(shown[next]!.key);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = shown[index];
      if (entry) onRun(entry.action);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          autoFocus
          type="text"
          placeholder="Go to a scene, a section, a sheet, or run a command"
          aria-label="Search commands"
          aria-controls="palette-list"
          aria-activedescendant={shown[index] ? `palette-${index}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          onKeyDown={onKeyDown}
        />
        <ul id="palette-list" role="listbox" ref={list}>
          {shown.map((entry, i) => (
            <li
              key={entry.key}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === index}
              onMouseMove={() => i !== index && setSelected(entry.key)}
              onMouseDown={(e) => {
                e.preventDefault();
                onRun(entry.action);
              }}
            >
              <span className="lb">{entry.label}</span>
              {entry.keys && <span className="kbd">{keyLabel(entry.keys)}</span>}
            </li>
          ))}
          {!shown.length && <li className="none">Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}
