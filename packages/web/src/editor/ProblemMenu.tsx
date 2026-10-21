import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { SNOOZE_MS } from 'promptbook-project';
import { snoozeDate } from '../dates.js';
import type { HideAs } from './cm/problems.js';

// When each snooze would end if chosen at `now`: «until Thu 22 Oct».
export function menuHints(now: Date): Record<'day' | 'week', string> {
  const until = (ms: number) => `until ${snoozeDate(new Date(now.getTime() + ms).toISOString(), now)}`;
  return { day: until(SNOOZE_MS.day), week: until(SNOOZE_MS.week) };
}

// A Checks row's «⋯» menu (hide-problems design decision 8), under its
// button and aligned to its right edge. Up and Down move between the items,
// Enter or Space chooses, Escape closes and puts the focus back on «⋯», Tab
// closes and moves on from «⋯»; a click outside or a scroll of what holds
// the button closes it.
export function ProblemMenu({
  id,
  anchor,
  onChoose,
  onClose,
}: {
  id: string;
  anchor: HTMLElement;
  onChoose(as: HideAs): void;
  // `refocus`: put the focus back on the button.
  onClose(refocus: boolean): void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [hints] = useState(() => menuHints(new Date()));
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const latest = useRef(onClose);
  latest.current = onClose;

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menu.current!;
    // Above the button when there is no room under it.
    const top = r.bottom + 4 + height > innerHeight - 8 ? Math.max(8, r.top - 4 - height) : r.bottom + 4;
    setPlace({ left: Math.max(8, Math.min(r.right - width, innerWidth - width - 8)), top });
  }, [anchor]);

  // Opening focuses the first item, once the menu is placed.
  const placed = place !== null;
  useEffect(() => {
    if (placed) items()[0]?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && (menu.current?.contains(target) || anchor.contains(target))) return;
      latest.current(false);
    };
    const scrolled = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && target.contains(anchor)) latest.current(false);
    };
    const resized = () => latest.current(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', resized);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', resized);
    };
  }, [anchor]);

  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

  function onKeyDown(event: KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => list[(to + list.length) % list.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        move(at + 1);
        break;
      case 'ArrowUp':
        move(at < 0 ? -1 : at - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(-1);
        break;
      case 'Escape':
        latest.current(true);
        break;
      case 'Tab':
        // Back on «⋯», from where the Tab goes on as usual.
        latest.current(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  return createPortal(
    <div
      ref={menu}
      id={id}
      className="pmenu"
      role="menu"
      aria-label="Snooze or dismiss"
      style={place ? { left: place.left, top: place.top } : { visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => onChoose('day')}>
        Snooze for a day <small>{hints.day}</small>
      </button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => onChoose('week')}>
        Snooze for a week <small>{hints.week}</small>
      </button>
      <hr role="separator" />
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => onChoose('dismiss')}>
        Dismiss <small>for good</small>
      </button>
    </div>,
    document.body,
  );
}
