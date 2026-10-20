import type { CampaignRef } from './model.js';
import type { Summary } from './summary.js';

// One row of the project list, as GET /api/projects answers it: a document's
// summary and the project's dates. Defined here so the server and the desktop
// app build the same row (desktop-app design decision 7).
export interface ProjectRow extends Summary, RowDates {}

export interface RowDates {
  createdAt: string;
  editedAt: string;
  deletedAt: string | null;
}

// The row of a summary. A link to a campaign that is not among `campaigns`
// (the user's campaigns not in the bin) reads as stand-alone: a campaign in
// the bin, gone, or not a campaign. The document is not rewritten.
export function projectRow(
  summary: Summary,
  dates: RowDates,
  campaigns: readonly Pick<CampaignRef, 'id'>[],
): ProjectRow {
  const linked = summary.campaignId !== null && campaigns.some((c) => c.id === summary.campaignId);
  return {
    ...summary,
    campaignId: linked ? summary.campaignId : null,
    createdAt: dates.createdAt,
    editedAt: dates.editedAt,
    deletedAt: dates.deletedAt,
  };
}
