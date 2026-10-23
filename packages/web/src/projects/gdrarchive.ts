import { LIMITS, parseGdrarchiveUrl, type GdrarchiveLink, type ResolvedGdrarchive } from 'promptbook-project';

// The texts of the gdrarchive link and the rule of its form's Save
// (gdrarchive-link design decision 12, from docs/mockups/gdrarchive-link.html).

// The address the form's error message and empty field show.
export const EXAMPLE_URL = 'https://gdrarchive.siberio.eu/campaigns/12';

export const WRONG_ADDRESS = `Paste a gdrarchive campaign address, like ${EXAMPLE_URL}`;

export const linkText = (label: string): string => (label ? `gdrarchive · ${label}` : 'gdrarchive campaign');

// The tooltip. The top bar names the campaign an inherited link comes from;
// the panel says it beside the link.
export function linkTitle(link: ResolvedGdrarchive, inBar: boolean): string {
  const from = inBar && link.from ? `From campaign ${link.from.title}. ` : '';
  return `${from}Opens ${link.url} in a new tab`;
}

// The form's preview line: «Shows as **<link>**, opening in a new tab.», or,
// with the address empty on a project that inherits, what it keeps.
export type Preview = { shows: string } | { keeps: string };

export function formPreview(address: string, label: string, inherited: { title: string } | null): Preview {
  if (!address.trim() && inherited) return { keeps: inherited.title };
  return { shows: linkText(label.trim()) };
}

// What Save does. An empty address keeps the inherited link or, with no link
// at all, closes the form; with a link of its own it is a wrong address, since
// removing is «Remove link»'s job. 'unchanged' closes the form without a write.
export type SaveAction = 'cancel' | 'invalid' | 'unchanged' | GdrarchiveLink;

export function saveAction(address: string, label: string, own: GdrarchiveLink | null): SaveAction {
  if (!address.trim() && !own) return 'cancel';
  const url = parseGdrarchiveUrl(address);
  if (url === null) return 'invalid';
  const trimmed = label.trim().slice(0, LIMITS.gdrarchiveLabel).trim();
  if (own && own.url === url && own.label === trimmed) return 'unchanged';
  return { url, label: trimmed };
}
