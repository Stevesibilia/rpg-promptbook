// How the footer and the cover print the front matter's `licenza`: the parser
// has already told an SPDX id from free text (`Meta.licence`).

export interface Licence {
  text: string;
  spdx: boolean;
}

// "CC-BY-NC-SA-4.0" prints as "CC BY-NC-SA 4.0"; any other SPDX id, and free
// text, as written.
export function licenceShort(licence: Licence): string {
  const text = licence.text.trim();
  if (!licence.spdx || !text.startsWith('CC-')) return text;
  const parts = text.slice('CC-'.length).split('-');
  const version = parts.length > 1 ? parts.pop()! : null;
  return ['CC', parts.join('-'), version].filter(Boolean).join(' ');
}

// The SPDX page of an SPDX id; free text has no link.
export function licenceUrl(licence: Licence): string | null {
  return licence.spdx ? `https://spdx.org/licenses/${licence.text.trim()}.html` : null;
}
