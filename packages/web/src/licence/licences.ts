// The licences the pane offers (licence-pane design decisions 1 to 3): UI
// data only. The format and the PDF keep taking any SPDX id or free text.

// Null: does not apply.
export type Mark = boolean | null;

export interface LicenceMarks {
  share: Mark;
  change: Mark;
  sell: Mark;
  credit: Mark;
  sameLicence: Mark;
}

export interface LicenceEntry {
  // What is written: an SPDX id, or free text.
  value: string;
  short: string;
  name: string;
  summary: string;
  // The Creative Commons deed; null for none.
  url: string | null;
  marks: LicenceMarks;
}

const marks = (share: Mark, change: Mark, sell: Mark, credit: Mark, sameLicence: Mark): LicenceMarks => ({
  share,
  change,
  sell,
  credit,
  sameLicence,
});

export const LICENCES: readonly LicenceEntry[] = [
  {
    value: 'CC0-1.0',
    short: 'CC0 1.0',
    name: 'Public Domain Dedication',
    summary: 'You give up your rights: anyone may copy, change and sell the adventure, even without naming you.',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    marks: marks(true, true, true, false, false),
  },
  {
    value: 'CC-BY-4.0',
    short: 'CC BY 4.0',
    name: 'Attribution',
    summary: 'Anyone may copy, change and sell it, as long as they credit you.',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    marks: marks(true, true, true, true, false),
  },
  {
    value: 'CC-BY-SA-4.0',
    short: 'CC BY-SA 4.0',
    name: 'Attribution-ShareAlike',
    summary: 'Anyone may copy, change and sell it, crediting you. Changed versions must carry this same licence.',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    marks: marks(true, true, true, true, true),
  },
  {
    value: 'CC-BY-NC-4.0',
    short: 'CC BY-NC 4.0',
    name: 'Attribution-NonCommercial',
    summary: 'Anyone may copy and change it, crediting you, but not sell it or use it to make money.',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
    marks: marks(true, true, false, true, false),
  },
  {
    value: 'CC-BY-NC-SA-4.0',
    short: 'CC BY-NC-SA 4.0',
    name: 'Attribution-NonCommercial-ShareAlike',
    summary:
      'Anyone may copy and change it, crediting you, but not for money. Changed versions must carry this same licence.',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    marks: marks(true, true, false, true, true),
  },
  {
    value: 'CC-BY-ND-4.0',
    short: 'CC BY-ND 4.0',
    name: 'Attribution-NoDerivatives',
    summary: 'Anyone may pass it on as it is, even for money, crediting you. Nobody may share a changed version.',
    url: 'https://creativecommons.org/licenses/by-nd/4.0/',
    marks: marks(true, false, true, true, null),
  },
  {
    value: 'CC-BY-NC-ND-4.0',
    short: 'CC BY-NC-ND 4.0',
    name: 'Attribution-NonCommercial-NoDerivatives',
    summary:
      'The narrowest CC licence: anyone may pass it on as it is, crediting you, not for money. No changed versions.',
    url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    marks: marks(true, false, false, true, null),
  },
  {
    value: 'Tutti i diritti riservati',
    short: 'All rights reserved',
    name: 'No licence, copyright only',
    summary:
      'Nobody may copy, change or pass it on without asking you first. Free text: the PDF prints it as written, with no link.',
    url: null,
    marks: marks(false, false, false, null, null),
  },
];

export const LICENCE_MARKS: readonly { key: keyof LicenceMarks; label: string; meaning: string }[] = [
  { key: 'share', label: 'Share', meaning: 'Copy it and pass it on' },
  { key: 'change', label: 'Change', meaning: 'Share changed versions (adaptations)' },
  { key: 'sell', label: 'Sell', meaning: 'Use it commercially, for money' },
  { key: 'credit', label: 'Credit', meaning: 'Credit required: anyone using it must name you' },
  {
    key: 'sameLicence',
    label: 'Same licence',
    meaning: 'Same licence required: changed versions must carry this licence',
  },
];
