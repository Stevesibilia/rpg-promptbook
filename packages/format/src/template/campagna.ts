import { defineTemplate } from './schema.js';

// Template "Campagna", version 1, for campaigns: the front matter keys and the
// sections a new campaign's skeleton writes. Campaigns are never checked.
export const campagna = defineTemplate({
  id: 'campagna',
  version: 1,
  name: 'Campagna',
  kind: 'campaign',
  meta: [
    { key: 'titolo', requirement: 'required', type: 'text', role: 'title' },
    { key: 'sistema', requirement: 'optional', type: 'text', role: 'system' },
    { key: 'formato', requirement: 'optional', type: 'text' },
    { key: 'autore', requirement: 'optional', type: 'text' },
    { key: 'copyright', requirement: 'optional', type: 'text' },
    { key: 'licenza', requirement: 'optional', type: 'licence' },
  ],
  sections: [
    { name: 'Premessa', requirement: 'optional' },
    { name: 'Fronti', requirement: 'optional' },
    { name: 'PNG ricorrenti', requirement: 'optional' },
    { name: 'Fili aperti', requirement: 'optional' },
    { name: 'Sessioni', requirement: 'optional' },
  ],
});

// Version 2: the sections of a campaign document as the owner writes them,
// each optional, with the PDF's page breaks before the long ones. The
// appendix holds image and music prompts and never prints.
export const campagnaV2 = defineTemplate({
  id: 'campagna',
  version: 2,
  name: 'Campagna',
  kind: 'campaign',
  meta: campagna.meta,
  sections: [
    { name: 'Premessa', requirement: 'optional' },
    { name: 'Verità del mondo', requirement: 'optional' },
    { name: 'Fronti', requirement: 'optional', pdf: { newPage: true } },
    { name: 'Fazioni', requirement: 'optional' },
    { name: 'PNG ricorrenti', requirement: 'optional', pdf: { newPage: true } },
    { name: 'PG e agganci', requirement: 'optional' },
    { name: 'Archi', requirement: 'optional', pdf: { newPage: true } },
    { name: 'Finali possibili', requirement: 'optional' },
    { name: 'Fili aperti', requirement: 'optional', pdf: { newPage: true } },
    { name: 'Temi e motivi', requirement: 'optional' },
    { name: 'Prima della campagna', requirement: 'optional' },
    { name: 'Aggiornamenti', requirement: 'optional' },
    { name: 'Appendice', heading: 'Appendice: stile visivo e sonoro', requirement: 'optional', role: 'appendix' },
  ],
});
