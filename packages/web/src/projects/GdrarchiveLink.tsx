import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  gdrarchiveOf,
  LIMITS,
  parseGdrarchiveUrl,
  setGdrarchive,
  type GdrarchiveLink as Link,
  type ProjectMeta,
  type ResolvedGdrarchive,
} from 'promptbook-project';
import type * as Y from 'yjs';
import type { ProjectRow } from '../api.js';
import { ExternalIcon } from '../ui/icons.js';
import { EXAMPLE_URL, formPreview, linkText, linkTitle, saveAction, WRONG_ADDRESS } from './gdrarchive.js';
import { categoryLabels } from './list.js';

// A project's link to its gdrarchive campaign (gdrarchive-link design
// decision 6), from docs/mockups/gdrarchive-link.html. The link opens in a
// new tab; the desktop app sends it to the system browser.

export function GdrarchiveLink({ link, inBar = false }: { link: ResolvedGdrarchive; inBar?: boolean }) {
  return (
    <a className="gdr-link" href={link.url} target="_blank" rel="noopener noreferrer" title={linkTitle(link, inBar)}>
      <span className="lb">{linkText(link.label)}</span>
      <ExternalIcon className="ic" />
    </a>
  );
}

// The line in the panel's header: the project's own link, its campaign's, or
// none, and the button that opens the form in its place. `campaign` is the
// project's campaign as the list has it, when it is a live campaign.
export function GdrarchiveField({
  doc,
  meta,
  campaign,
}: {
  doc: Y.Doc;
  meta: ProjectMeta;
  campaign: ProjectRow | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Set when the form closes, so the focus goes to the line's button rather
  // than the page's body (D14).
  const refocus = useRef(false);
  const link = gdrarchiveOf(meta.gdrarchive, meta.category, campaign ?? null);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    button.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <GdrarchiveForm
        doc={doc}
        own={meta.gdrarchive}
        inherited={link?.from ? link : null}
        campaignHasLink={!!campaign?.gdrarchive && meta.category !== 'campaign'}
        onClose={() => {
          refocus.current = true;
          setEditing(false);
        }}
      />
    );
  }
  const open = () => setEditing(true);
  if (!link) {
    return (
      <div className="gdr">
        <button ref={button} className="q add" onClick={open}>
          Link to gdrarchive…
        </button>
      </div>
    );
  }
  return (
    <div className="gdr">
      <GdrarchiveLink link={link} />
      {link.from ? (
        <>
          <span className="from">from campaign {link.from.title}</span>
          <button
            ref={button}
            className="q"
            title={`Give this ${categoryLabels[meta.category].toLowerCase()} a link of its own`}
            onClick={open}
          >
            Set its own…
          </button>
        </>
      ) : (
        <button ref={button} className="q" title="Change or remove the gdrarchive link" onClick={open}>
          Change…
        </button>
      )}
    </div>
  );
}

// Sets, changes or removes the project's own link. Enter in either field
// saves, Escape anywhere in the form cancels; the address is checked on Save.
// The form works from the link as it was when it opened: a change made on
// another device meanwhile is not written back by a Save that changed nothing.
export function GdrarchiveForm({
  doc,
  own,
  inherited,
  campaignHasLink,
  onClose,
}: {
  doc: Y.Doc;
  own: Link | null;
  // The campaign's link the project shows while it has none of its own.
  inherited: ResolvedGdrarchive | null;
  campaignHasLink: boolean;
  onClose(): void;
}) {
  const [initial] = useState(own);
  const [address, setAddress] = useState(own?.url ?? '');
  const [label, setLabel] = useState(own?.label ?? '');
  const [wrong, setWrong] = useState(false);
  // Counts the refused Saves, so the message is announced again each time.
  const [refusals, setRefusals] = useState(0);
  const addressRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const preview = formPreview(address, label, inherited?.from ?? null);

  function save() {
    const action = saveAction(address, label, initial);
    if (action === 'invalid') {
      setWrong(true);
      setRefusals((n) => n + 1);
      const input = addressRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
      return;
    }
    if (typeof action === 'object') setGdrarchive(doc, action);
    onClose();
  }

  const enter = (event: KeyboardEvent) => {
    // The Enter that confirms an input method's candidate is not a Save.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    save();
  };

  return (
    <div
      className="gdr-form"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
    >
      <h4>gdrarchive campaign</h4>
      <label>
        <span className="lt">Address</span>
        <input
          ref={addressRef}
          autoFocus
          type="url"
          spellCheck={false}
          autoComplete="off"
          className={wrong ? 'bad' : undefined}
          placeholder={inherited?.url ?? EXAMPLE_URL}
          value={address}
          aria-invalid={wrong}
          aria-describedby={wrong ? errorId : undefined}
          onChange={(e) => {
            setAddress(e.target.value);
            if (wrong && parseGdrarchiveUrl(e.target.value) !== null) setWrong(false);
          }}
          onKeyDown={enter}
        />
      </label>
      {wrong && (
        <div key={refusals} className="err" id={errorId} role="alert">
          {WRONG_ADDRESS}
        </div>
      )}
      <label>
        <span className="lt">
          Label <i>· optional, a short name</i>
        </span>
        <input
          maxLength={LIMITS.gdrarchiveLabel}
          placeholder="e.g. Kulthos"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={enter}
        />
      </label>
      <div className="fh">
        {'keeps' in preview ? (
          `Left empty, it keeps the link of campaign ${preview.keeps}.`
        ) : (
          <>
            Shows as <b>{preview.shows}</b>, opening in a new tab.
          </>
        )}
      </div>
      <div className="acts">
        <button className="tb primary sm" onClick={save}>
          Save
        </button>
        <button className="tb sm" onClick={onClose}>
          Cancel
        </button>
        <span className="spacer" />
        {initial && (
          <button
            className="tb danger sm"
            title={campaignHasLink ? "Back to the campaign's link" : 'The project keeps no link'}
            onClick={() => {
              setGdrarchive(doc, null);
              onClose();
            }}
          >
            Remove link
          </button>
        )}
      </div>
    </div>
  );
}
