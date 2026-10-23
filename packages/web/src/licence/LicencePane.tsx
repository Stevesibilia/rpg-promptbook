import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ExternalIcon } from '../ui/icons.js';
import { Modal } from '../ui/Modal.js';
import { LICENCE_MARKS, LICENCES, type Mark } from './licences.js';
import './licence.css';

const word = (mark: Mark) => (mark === null ? 'does not apply' : mark ? 'yes' : 'no');
const symbol = (mark: Mark) => (mark === null ? '—' : mark ? '✓' : '✕');
const markClass = (mark: Mark) => (mark === null ? 'na' : mark ? 'y' : 'n');

// A click on «Full text» only opens the link.
const onLink = (event: MouseEvent) => event.target instanceof Element && !!event.target.closest('a');

// «Choose a licence» (licence-pane design decision 4): the eight licences
// with their marks; the row equal to the current value starts selected. It
// writes nothing itself: the caller writes the pick, closes it and puts the
// focus back where it was opened from.
export function LicencePane({
  current,
  context,
  onPick,
  onClose,
}: {
  current: string;
  context: 'settings' | 'editor';
  onPick(value: string): void;
  onClose(): void;
}) {
  const value = current.trim();
  const currentIndex = LICENCES.findIndex((licence) => licence.value === value);
  const [selected, setSelected] = useState(currentIndex);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const rowId = (i: number) => `${id}-lic-${i}`;

  // The list takes the focus, so the page's shortcuts stand aside.
  useEffect(() => {
    list.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (selected >= 0) document.getElementById(`${id}-lic-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [id, selected]);

  const select = (i: number) => {
    setSelected(i);
    list.current?.focus({ preventScroll: true });
  };
  // Picking the current value writes nothing.
  const pick = (i: number) => {
    const licence = LICENCES[i];
    if (!licence) return;
    if (licence.value === value) onClose();
    else onPick(licence.value);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const n = LICENCES.length;
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = selected < 0 ? 0 : (selected + 1) % n;
    else if (event.key === 'ArrowUp') next = selected < 0 ? 0 : (selected - 1 + n) % n;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = n - 1;
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (selected >= 0) pick(selected);
      return;
    } else return;
    event.preventDefault();
    select(next);
  };

  const already = selected >= 0 && LICENCES[selected]!.value === value;
  const writes = (v: string) => (context === 'editor' ? `licenza: ${v}` : v);

  return (
    <Modal
      title="Choose a licence"
      onClose={onClose}
      className="lic"
      footer={
        <>
          <span className="note">
            Not legal advice. Free text still works: type anything in the{' '}
            {context === 'editor' ? 'front matter' : 'field'}.
          </span>
          <button className="tb line" onClick={onClose}>
            Cancel
          </button>
          <button
            className="tb primary"
            disabled={selected < 0 || already}
            title={already ? 'Already the licence' : undefined}
            onClick={() => pick(selected)}
          >
            Use licence
          </button>
        </>
      }
    >
      {value && currentIndex < 0 && (
        <p className="cur-note">
          Current: <b>{value}</b>, not one of these; picking one replaces it.
        </p>
      )}
      <div className="lic-head" aria-hidden="true">
        <span />
        <span className="lic-head-name">Licence</span>
        {LICENCE_MARKS.map((mark) => (
          <span key={mark.key} title={mark.meaning}>
            {mark.label}
          </span>
        ))}
      </div>
      <ul
        ref={list}
        className="lic-list"
        role="listbox"
        tabIndex={0}
        aria-label="Licences"
        aria-activedescendant={selected >= 0 ? rowId(selected) : undefined}
        onKeyDown={onKeyDown}
      >
        {LICENCES.map((licence, i) => (
          <li
            key={licence.value}
            id={rowId(i)}
            className="lic-row"
            role="option"
            aria-selected={i === selected}
            aria-labelledby={`${rowId(i)}-t`}
            aria-describedby={`${rowId(i)}-d ${rowId(i)}-m`}
            onClick={(event) => !onLink(event) && select(i)}
            onDoubleClick={(event) => !onLink(event) && pick(i)}
          >
            <span className="radio" aria-hidden="true" />
            <div className="lic-main">
              <div className="lic-t" id={`${rowId(i)}-t`}>
                <b>{licence.short}</b>
                <span className="pw">{licence.name}</span>
                {i === currentIndex && <span className="curchip">Current</span>}
              </div>
              <p className="lic-d" id={`${rowId(i)}-d`}>
                {licence.summary}
              </p>
              <div className="lic-w">
                <span>
                  Writes <code>{writes(licence.value)}</code>
                </span>
                {licence.url && (
                  <a
                    href={licence.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Opens ${licence.url} in a new tab`}
                  >
                    Full text
                    <ExternalIcon className="ic" />
                  </a>
                )}
              </div>
            </div>
            <span className="marks" id={`${rowId(i)}-m`}>
              {LICENCE_MARKS.map((mark) => {
                const m = licence.marks[mark.key];
                return (
                  <span
                    key={mark.key}
                    className={`mark ${markClass(m)}`}
                    role="img"
                    title={`${mark.meaning}: ${word(m)}`}
                    aria-label={`${mark.label}: ${word(m)}`}
                  >
                    {symbol(m)}
                    <span className="ml">{mark.label}</span>
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
