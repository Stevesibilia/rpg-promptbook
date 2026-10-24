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
