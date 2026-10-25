import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  builtinSystems,
  builtinTemplates,
  templateChanges,
  templates as builtins,
  type AdventureTemplate,
  type Template,
} from 'promptbook-format';
import { skeletonDocument, type Settings } from 'promptbook-project';
import { api, ApiError } from '../api.js';
import { NEEDS_SERVER, NeedsServer } from '../desktop/NeedsServer.js';
import { useOffline } from '../desktop/useDevice.js';
import { Confirm } from '../ui/Confirm.js';
import { issueText } from './changes.js';
import { checkDraft, draftReducer } from './draft.js';
import { kindLabels, latestVersions } from './list.js';
import { previewMarks } from './marks.js';
import { SaveDialog } from './SaveDialog.js';
import { StartingPreview } from './StartingPreview.js';
import { useDuplicate } from './TemplateList.js';
import { BoxesTab, FieldsTab, KeysTab, LimitsTab, SectionsTab } from './TemplateRows.js';
import { useTemplates } from './TemplatesContext.js';
import './templates.css';

type Tab = 'sections' | 'fields' | 'boxes' | 'keys' | 'limits';

const LIST_PATH = '/settings/documents';

// The template editor (mockup states 2 to 6), at /settings/documents/:id.
// A built-in opens read-only with a «Duplicate» banner.
export function TemplateEditor({ id, settings }: { id: string; settings: Settings | null }) {
  const { stored, loaded, error } = useTemplates();
  const builtin = builtinTemplates.find((t) => t.id === id);
  const own = latestVersions(stored).get(id)?.body;
  const saved = builtin ?? own;
  if (!saved) {
    return (
      <section>
        <div className="te-head">
          <Link className="tb back" to={LIST_PATH}>
            ← Document templates
          </Link>
        </div>
        <p className="loading">{!loaded ? 'Loading…' : error || 'This template is not there any more.'}</p>
      </section>
    );
  }
  // Keyed by the template alone: a list read again elsewhere must not throw
  // the draft away. A save moves the editor to its own new version.
  return <Editor key={saved.id} initial={saved} builtin={!!builtin} settings={settings} />;
}

function Editor({ initial, builtin, settings }: { initial: Template; builtin: boolean; settings: Settings | null }) {
  const { usage, reload } = useTemplates();
  const navigate = useNavigate();
  const offline = useOffline();
  const duplicate = useDuplicate();
  // The version the draft started from, and the draft.
  const [base, setBase] = useState(initial);
  const [draft, dispatch] = useReducer(draftReducer, initial);
  const [tab, setTab] = useState<Tab>('sections');
  const [dialog, setDialog] = useState<'save' | 'leave' | null>(null);
  const [duplicateError, setDuplicateError] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const readOnly = builtin || offline;
  const campaign = draft.kind === 'campaign';

  const check = useMemo(() => checkDraft(draft), [draft]);
  // While the draft is invalid, the preview and the counts stay on the last
  // valid one.
  const lastValid = useRef<Template>(initial);
  if (check.ok) lastValid.current = check.template;
  const valid = lastValid.current;
  const changes = useMemo(() => templateChanges(base, valid), [base, valid]);
  // Unsaved: what the save would change, or a draft that cannot be saved.
  // Every control edits something templateChanges compares.
  const dirty = !check.ok || changes.length > 0;

  const text = useMemo(
    () =>
      skeletonDocument(campaign ? 'campaign' : 'adventure', {
        title: campaign ? 'Nuova campagna' : 'Nuova avventura',
        system: '',
        campaignTitle: null,
        author: settings?.author ?? '',
        copyright: settings?.copyright ?? '',
        licence: settings?.licence ?? '',
      }, valid),
    [valid, campaign, settings],
  );
  const marks = useMemo(() => previewMarks(text, base, valid), [text, base, valid]);
  // The boxes and the scene id the preview styles with, the same object
  // while they stay, so the preview keeps its view while the user types.
  const styleKey = valid.kind === 'adventure' ? JSON.stringify([valid.callouts, valid.ids.scene]) : '';
  const previewTemplate = useMemo<AdventureTemplate>(
    () => (valid.kind === 'adventure' ? valid : builtins.avventura),
    [styleKey],
  );

  // Leaving with unsaved changes asks first (design decision 16): the tab's
  // close and reload, the page's own ways out (the rail, the logo, the
  // Settings menu), caught before they navigate, and the browser's Back,
  // caught by an extra history entry for the same address.
  const leaving = useRef<HTMLElement | 'history' | null>(null);
  const allowLeave = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const draftEntry = () => (history.state as { templateDraft?: boolean } | null)?.templateDraft === true;
    if (!draftEntry()) history.pushState({ ...(history.state as object), templateDraft: true }, '');
    const popState = () => {
      if (allowLeave.current || draftEntry()) return;
      // Back from the extra entry: the address is still the editor's. Stay,
      // and ask.
      history.pushState({ ...(history.state as object), templateDraft: true }, '');
      leaving.current = 'history';
      setDialog('leave');
    };
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const click = (event: MouseEvent) => {
      if (allowLeave.current || event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest('a[href], button') : null;
      if (!(target instanceof HTMLElement) || !target.closest('.rail, .topbar .logo, .set > nav')) return;
      event.preventDefault();
      event.stopPropagation();
      leaving.current = target;
      setDialog('leave');
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', popState);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', popState);
      document.removeEventListener('click', click, true);
    };
  }, [dirty]);
  const back = () => {
    if (dirty) {
      leaving.current = null;
      setDialog('leave');
    } else navigate(LIST_PATH);
  };
  const leave = () => {
    allowLeave.current = true;
    const target = leaving.current;
    // Past the extra entry and the editor's own, to where Back was going.
    if (target === 'history') history.go(-2);
    else if (target?.isConnected) target.click();
    else navigate(LIST_PATH);
  };

  const versionUsers = usage[`${base.id}@${base.version}`] ?? 0;
  const newUid = () => crypto.randomUUID();
  const save = async (note: string) => {
    const savedVersion = await api.saveTemplateVersion(base.id, base.version, valid, note);
    await reload();
    setBase(savedVersion.body);
    dispatch({ type: 'reset', template: savedVersion.body });
    lastValid.current = savedVersion.body;
    setDialog(null);
  };
  // After a conflict: the latest version, the draft dropped.
  const reloadLatest = async () => {
    const latest = latestVersions((await api.templates()).templates).get(base.id)?.body;
    await reload();
    if (!latest) {
      navigate(LIST_PATH);
      return;
    }
    setBase(latest);
    dispatch({ type: 'reset', template: latest });
    lastValid.current = latest;
    setDialog(null);
  };

  const tabs: [Tab, string, number | null][] = [
    ['sections', 'Sections', draft.sections.length],
    ...(draft.kind === 'adventure'
      ? ([
          ['fields', 'Scene fields', draft.sceneFields.length],
          ['boxes', 'Boxes', draft.callouts.length],
        ] as [Tab, string, number][])
      : []),
    ['keys', 'Front matter', draft.meta.length],
    ...(draft.kind === 'adventure' ? ([['limits', 'Limits and style', null]] as [Tab, string, null][]) : []),
  ];
  const shown: Tab = tabs.some(([k]) => k === tab) ? tab : 'sections';
  const props = { draft, saved: base, dispatch, readOnly, newUid };
  const systems = builtinSystems.map((s) => s.name);
  const system = draft.kind === 'adventure' ? (draft.system ?? '') : '';

  return (
    <section className="te">
      <div className="te-head">
        <button className="tb back" onClick={back}>
          ← Document templates
        </button>
      </div>
      {builtin && (
        <div className="banner">
          <span>
            <b>Built-in template.</b> It can't be changed; duplicate it to make your own.
          </span>
          <NeedsServer>
            <button
              className="tb primary"
              disabled={offline || duplicating}
              onClick={() => {
                if (duplicating) return;
                setDuplicating(true);
                setDuplicateError('');
                duplicate(base)
                  .catch((e) => setDuplicateError(e instanceof ApiError ? e.message : 'Duplicating failed.'))
                  .finally(() => setDuplicating(false));
              }}
            >
              {duplicating ? 'Duplicating…' : 'Duplicate'}
            </button>
          </NeedsServer>
          {duplicateError && <span className="err-inline">{duplicateError}</span>}
        </div>
      )}
      {offline && !builtin && <p className="needs-line">{NEEDS_SERVER}</p>}
      <div className="card">
        <div className="te-gen">
          <div className="field">
            <label htmlFor="tpl-name">Name</label>
            <input
              id="tpl-name"
              value={draft.name}
              maxLength={200}
              disabled={readOnly}
              onChange={(e) => dispatch({ type: 'name', value: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="tpl-kind">For</label>
            <select id="tpl-kind" disabled value={draft.kind}>
              <option value={draft.kind}>{kindLabels[draft.kind]}</option>
            </select>
          </div>
          {draft.kind === 'adventure' && (
            <div className="field">
              <label htmlFor="tpl-system">Game system</label>
              <select
                id="tpl-system"
                value={system}
                disabled={readOnly}
                onChange={(e) => dispatch({ type: 'system', value: e.target.value })}
              >
                <option value="">None</option>
                {[...new Set([...systems, ...(system ? [system] : [])])].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span className="hint">Grades and wounds come from the game system.</span>
            </div>
          )}
        </div>
      </div>
      <div className="te-body">
        <div className="te-main">
          <div className="tabs" role="tablist" aria-label="Template parts">
            {tabs.map(([key, label, count]) => (
              <button
                key={key}
                role="tab"
                aria-selected={shown === key}
                className={shown === key ? 'on' : ''}
                onClick={() => setTab(key)}
              >
                {label}
                {count !== null && <span className="n">{count}</span>}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={tabs.find(([k]) => k === shown)?.[1]}>
            {shown === 'sections' && <SectionsTab {...props} />}
            {shown === 'fields' && draft.kind === 'adventure' && <FieldsTab {...props} draft={draft} />}
            {shown === 'boxes' && draft.kind === 'adventure' && <BoxesTab {...props} draft={draft} />}
            {shown === 'keys' && <KeysTab {...props} />}
            {shown === 'limits' && draft.kind === 'adventure' && <LimitsTab {...props} draft={draft} />}
          </div>
        </div>
        <StartingPreview text={text} template={previewTemplate} marks={marks} chip={builtin ? `v${base.version}` : 'live'} />
      </div>
      {!builtin && dirty && (
        <div className="savebar" role="region" aria-label="Unsaved changes">
          <span className="msg">
            <b>
              {changes.length} unsaved change{changes.length === 1 ? '' : 's'}
            </b>{' '}
            ·{' '}
            {versionUsers
              ? `${versionUsers} project${versionUsers === 1 ? '' : 's'} use${versionUsers === 1 ? 's' : ''} v${base.version} and keep${versionUsers === 1 ? 's' : ''} it until updated`
              : 'no projects use this version'}
            {!check.ok && (
              <span className="issues" role="alert">
                {check.issues.map((issue) => (
                  <span key={issue}>{issueText(issue)}</span>
                ))}
              </span>
            )}
          </span>
          <button className="tb line" onClick={() => dispatch({ type: 'reset', template: base })}>
            Discard
          </button>
          <NeedsServer>
            <button
              className="tb primary"
              disabled={offline || !check.ok || changes.length === 0}
              onClick={() => setDialog('save')}
            >
              Save as v{base.version + 1}
            </button>
          </NeedsServer>
        </div>
      )}
      {dialog === 'save' && (
        <SaveDialog
          name={valid.name}
          base={base.version}
          changes={changes}
          to={valid}
          onBase={versionUsers}
          onSave={save}
          onReload={reloadLatest}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'leave' && (
        <Confirm
          title="Discard unsaved changes?"
          action="Discard"
          danger
          focusCancel
          onConfirm={leave}
          onClose={() => {
            setDialog(null);
            const target = leaving.current;
            if (target instanceof HTMLElement && target.isConnected) target.focus();
          }}
        >
          Your changes to «{draft.name || base.name}» are not saved.
        </Confirm>
      )}
    </section>
  );
}
