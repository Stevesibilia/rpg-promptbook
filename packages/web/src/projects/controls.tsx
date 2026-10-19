import { useEffect, useState } from 'react';
import { setCampaign, setStatus, setTitle, statuses, type ProjectMeta, type Status } from 'promptbook-project';
import type * as Y from 'yjs';
import type { ProjectRow } from '../api.js';
import { statusLabels } from './list.js';

// Controls that change a project's metadata through its document; the panel
// and the project page share them.

export function StatusSelect({ doc, status }: { doc: Y.Doc; status: Status }) {
  return (
    <select aria-label="Status" value={status} onChange={(e) => setStatus(doc, e.target.value as Status)}>
      {statuses.map((s) => (
        <option key={s} value={s}>
          {statusLabels[s]}
        </option>
      ))}
    </select>
  );
}

// Stand-alone or one of the user's campaigns; never offered for a campaign.
export function CampaignSelect({
  doc,
  meta,
  campaigns,
}: {
  doc: Y.Doc;
  meta: ProjectMeta;
  campaigns: readonly ProjectRow[];
}) {
  const known = campaigns.some((c) => c.id === meta.campaignId);
  return (
    <select
      aria-label="Campaign"
      value={known ? (meta.campaignId ?? '') : ''}
      onChange={(e) => setCampaign(doc, e.target.value || null)}
    >
      <option value="">Stand-alone</option>
      {campaigns
        .filter((c) => c.id !== meta.id)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
    </select>
  );
}

// The title, edited in place: Enter or leaving the field saves it, Escape
// puts it back.
export function TitleInput({ doc, title }: { doc: Y.Doc; title: string }) {
  const [value, setValue] = useState(title);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setValue(title);
  }, [title, focused]);

  const commit = () => {
    const next = value.trim();
    if (next && next !== title) setTitle(doc, next);
    else setValue(title);
  };

  return (
    <input
      className="title-edit"
      aria-label="Title"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(title);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}
