import { LIMITS, type Category } from './model.js';

// A project's link to its campaign in gdrarchive (gdrarchive-link design
// decisions 1, 2, 4 and 10). Promptbook never calls gdrarchive: the link is an
// address the owner pastes, opened in a new tab.

// The one archive a link may lead to. A move to another host is this line;
// links stored with the old host then read as no link.
export const GDRARCHIVE_ORIGIN = 'https://gdrarchive.siberio.eu';

export interface GdrarchiveLink {
  // Normalised, as parseGdrarchiveUrl answers it.
  url: string;
  // Trimmed, '' when there is none.
  label: string;
}

// The link a project shows, and the campaign it comes from when inherited.
export interface ResolvedGdrarchive extends GdrarchiveLink {
  from: { id: string; title: string } | null;
}

const escaped = GDRARCHIVE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CAMPAIGN_URL = new RegExp(`^(${escaped}/campaigns/[A-Za-z0-9_-]{1,64})/?$`);

// The campaign address without its trailing slash, or null for anything else:
// another host or scheme, a query, a fragment, another path.
export function parseGdrarchiveUrl(input: string): string | null {
  const match = CAMPAIGN_URL.exec(input.trim());
  return match ? match[1]! : null;
}

// A label as a writer takes it: trimmed and short enough.
export const isGdrarchiveLabel = (label: unknown): label is string =>
  typeof label === 'string' && label === label.trim() && label.length <= LIMITS.gdrarchiveLabel;

// The meta value as another client wrote it: the link only when its address is
// normalised and its label valid, else null, whole.
export function readGdrarchive(value: unknown): GdrarchiveLink | null {
  if (typeof value !== 'object' || value === null) return null;
  const { url, label } = value as { url?: unknown; label?: unknown };
  if (typeof url !== 'string' || parseGdrarchiveUrl(url) !== url || !isGdrarchiveLabel(label)) return null;
  return { url, label };
}

// The link a project shows: its own, else the campaign's for a project that is
// not a campaign. The caller passes the campaign only when it is a live
// campaign of the user; a row from before this change has no gdrarchive field.
export function gdrarchiveOf(
  own: GdrarchiveLink | null,
  category: Category,
  campaign: { id: string; title: string; gdrarchive?: GdrarchiveLink | null } | null,
): ResolvedGdrarchive | null {
  if (own) return { url: own.url, label: own.label, from: null };
  if (category === 'campaign' || !campaign?.gdrarchive) return null;
  const { url, label } = campaign.gdrarchive;
  return { url, label, from: { id: campaign.id, title: campaign.title } };
}
