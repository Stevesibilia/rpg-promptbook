import { describe, expect, it } from 'vitest';
import {
  addImagePrompt,
  matchFile,
  matchKey,
  matchTargets,
  parseMidjourney,
  parseSuno,
  readDocumentBoard,
  type MatchTargets,
} from '../src/index.js';
import { project } from './helpers.js';

const JOB = '8c1e2f40-1b2a-4c3d-9e8f-0a1b2c3d4e5f';

// The mockup's prompts (docs/mockups/board.html), in every category.
const targets: MatchTargets = {
  prompts: [
    { id: 's1', prompt: 'collapsed 1900s Sicilian library at night, broken beams, books buried in dust --ar 16:9 --v 8.1' },
    { id: 's2', prompt: "ruined doctor's office in 1908 Messina, anatomical drawings of a sea strait --ar 16:9 --v 8.1" },
    { id: 's3', prompt: 'collapsed cathedral facade in 1908 Messina, Italian soldiers --ar 16:9 --v 8.1' },
    { id: 's5', prompt: 'Città sul mare, all’alba' },
    { id: 'anselmo', prompt: 'portrait of an old Sicilian priest with a cracked rosary --ar 2:3 --v 8.1' },
    { id: 'rosalia', prompt: 'portrait of a young Sicilian nurse in 1908 --ar 2:3 --v 8.1' },
    { id: 'letter', prompt: 'handwritten letter on yellowed paper, wax seal --ar 3:4 --v 8.1' },
  ],
  scenes: [
    { sceneId: 'S1', title: 'Cinque e venti' },
    { sceneId: 'S2', title: 'Anatomia dello Stretto' },
    { sceneId: 'S3', title: 'Ordini del Re' },
    { sceneId: 'S4', title: 'Città più già' },
    { sceneId: 'S5', title: null },
  ],
};

describe('matchKey', () => {
  it('drops accents, case, spaces and punctuation', () => {
    expect(matchKey("Ruined doctor's office, 1908!")).toBe('ruineddoctorsoffice1908');
    expect(matchKey('Città più GIÀ')).toBe('cittapiugia');
    expect(matchKey('dominus_deus  sabaoth')).toBe('dominusdeussabaoth');
    expect(matchKey('—…')).toBe('');
  });
});

describe('parseMidjourney', () => {
  it('reads the mockup’s names', () => {
    expect(parseMidjourney(`steve_a_vast_cathedral_nave_flooded_with_seawater_${JOB}_2.png`)).toEqual({
      user: 'steve',
      words: ['a', 'vast', 'cathedral', 'nave', 'flooded', 'with', 'seawater'],
      job: JOB,
      n: 2,
    });
  });

  it('reads design.md’s example with its double underscore', () => {
    const name = 'steve_studio_portrait_of_a_thin_wiry_Sicilian_coral__b2f23f24-1a2b-4c3d-8e9f-0a1b2c3d4e5f_3.png';
    expect(parseMidjourney(name)?.words).toEqual(['studio', 'portrait', 'of', 'a', 'thin', 'wiry', 'Sicilian', 'coral']);
    expect(parseMidjourney(name)?.n).toBe(3);
  });

  it('takes upper-case extensions, JPEG and WebP, and a name without the grid number', () => {
    expect(parseMidjourney(`steve_a_vast_hall_${JOB}.PNG`)).toMatchObject({ words: ['a', 'vast', 'hall'], n: null });
    expect(parseMidjourney(`steve_a_vast_hall_${JOB}_0.jpeg`)?.n).toBe(0);
    expect(parseMidjourney(`steve_a_vast_hall_${JOB}_1.WebP`)?.n).toBe(1);
  });

  it('keeps a user name with underscores in the words', () => {
    expect(parseMidjourney(`john_doe_a_vast_hall_${JOB}_1.png`)).toMatchObject({
      user: 'john',
      words: ['doe', 'a', 'vast', 'hall'],
    });
  });

  it('refuses other names', () => {
    expect(parseMidjourney('a_vast_hall.png')).toBeNull();
    expect(parseMidjourney(`steve_a_vast_hall_${JOB}_1.gif`)).toBeNull();
    expect(parseMidjourney(`steve_${JOB}_1.png`)).toBeNull();
    expect(parseMidjourney('cinque e venti.mp3')).toBeNull();
  });
});

describe('parseSuno', () => {
  it('reads the title and the take', () => {
    expect(parseSuno('cinque e venti.mp3')).toEqual({ title: 'cinque e venti', take: null });
    expect(parseSuno('cinque e venti (1).mp3')).toEqual({ title: 'cinque e venti', take: 1 });
    expect(parseSuno('Dominus Deus Sabaoth (12).M4A')).toEqual({ title: 'Dominus Deus Sabaoth', take: 12 });
    for (const ext of ['aac', 'wav', 'ogg', 'flac']) expect(parseSuno(`x.${ext}`)?.title).toBe('x');
  });

  it('keeps brackets that are not a take', () => {
    expect(parseSuno('canto (live).mp3')).toEqual({ title: 'canto (live)', take: null });
    expect(parseSuno('canto(1).mp3')).toEqual({ title: 'canto(1)', take: null });
  });

  it('refuses other extensions', () => {
    expect(parseSuno('cinque e venti.png')).toBeNull();
    expect(parseSuno('cinque e venti.opus')).toBeNull();
    expect(parseSuno('.mp3')).toBeNull();
  });
});

describe('matchFile', () => {
  it('finds the one prompt whose text starts with the words, in any category', () => {
    expect(matchFile(`steve_collapsed_1900s_Sicilian_library_at_night_${JOB}_0.png`, 'image', targets)).toEqual({
      promptId: 's1',
      matchedBy: 'prompt',
    });
    expect(matchFile(`steve_portrait_of_an_old_Sicilian_priest_${JOB}_2.png`, 'image', targets)).toEqual({
      promptId: 'anselmo',
      matchedBy: 'prompt',
    });
    expect(matchFile(`steve_handwritten_letter_on_yellowed_${JOB}_0.png`, 'image', targets)).toEqual({
      promptId: 'letter',
      matchedBy: 'prompt',
    });
  });

  it('matches across the apostrophe Midjourney drops', () => {
    const name = `steve_ruined_doctors_office_in_1908_Messina_anatomical_${JOB}_1.png`;
    expect(matchFile(name, 'image', targets)).toEqual({ promptId: 's2', matchedBy: 'prompt' });
  });

  it('matches words cut mid-word', () => {
    expect(matchFile(`steve_collapsed_cathedral_fac_${JOB}_3.png`, 'image', targets)).toEqual({
      promptId: 's3',
      matchedBy: 'prompt',
    });
  });

  it('matches across accents', () => {
    expect(matchFile(`steve_Citta_sul_mare_${JOB}_0.webp`, 'image', targets)).toEqual({ promptId: 's5', matchedBy: 'prompt' });
    expect(matchFile('citta piu gia.mp3', 'audio', targets)).toEqual({ sceneId: 'S4', matchedBy: 'title' });
  });

  it('says why when no prompt starts with the words, and names the candidates when several do', () => {
    expect(matchFile(`steve_a_vast_cathedral_nave_flooded_with_seawater_${JOB}_2.png`, 'image', targets)).toEqual({
      reason: 'No prompt starts with "a vast cathedral nave flooded".',
      candidates: [],
    });
    expect(matchFile(`steve_collapsed_${JOB}_2.png`, 'image', targets)).toEqual({
      reason: 'Several prompts start with "collapsed".',
      candidates: ['s1', 's3'],
    });
    expect(matchFile(`steve_portrait_of_a_${JOB}_2.png`, 'image', targets)).toEqual({
      reason: 'Several prompts start with "portrait of a".',
      candidates: ['anselmo', 'rosalia'],
    });
  });

  it('finds the candidates across categories', () => {
    const shared: MatchTargets = {
      prompts: [
        { id: 's4-2', prompt: 'portrait of an old Sicilian fisherwoman singing on the quay --ar 16:9' },
        { id: 'nina', prompt: 'portrait of an old Sicilian fisherwoman singing, close up --ar 2:3' },
      ],
      scenes: [],
    };
    expect(matchFile(`steve_portrait_of_an_old_Sicilian_fisherwoman_singing_${JOB}_0.png`, 'image', shared)).toEqual({
      reason: 'Several prompts start with "portrait of an old Sicilian".',
      candidates: ['s4-2', 'nina'],
    });
  });

  it('drops the words of a user name with underscores, while 12 key characters remain', () => {
    expect(matchFile(`john_doe_ruined_doctors_office_${JOB}_1.png`, 'image', targets)).toEqual({
      promptId: 's2',
      matchedBy: 'prompt',
    });
    expect(matchFile(`john_doe_smith_ruined_doctors_office_${JOB}_1.png`, 'image', targets)).toEqual({
      promptId: 's2',
      matchedBy: 'prompt',
    });
    // "ruined" alone is too short to trust.
    expect(matchFile(`john_doe_ruined_${JOB}_1.png`, 'image', targets)).toEqual({
      reason: 'No prompt starts with "doe ruined".',
      candidates: [],
    });
  });

  it('finds a track by its title, a second take too', () => {
    expect(matchFile('cinque e venti.mp3', 'audio', targets)).toEqual({ sceneId: 'S1', matchedBy: 'title' });
    expect(matchFile('Ordini del re (1).mp3', 'audio', targets)).toEqual({ sceneId: 'S3', matchedBy: 'title' });
    expect(matchFile('untitled track.mp3', 'audio', targets)).toEqual({
      reason: 'No track title "untitled track".',
      candidates: [],
    });
  });

  it('matches no track whose title two scenes share', () => {
    const shared = { ...targets, scenes: [...targets.scenes, { sceneId: 'S6', title: 'Cinque e Venti!' }] };
    expect(matchFile('cinque e venti (1).mp3', 'audio', shared)).toEqual({
      reason: 'Several scenes have the track title "cinque e venti".',
      candidates: [],
    });
  });

  it('leaves other names unmatched', () => {
    for (const [name, kind] of [
      ['IMG_2031.png', 'image'],
      ['cinque e venti.mp3', 'image'],
      [`steve_collapsed_1900s_${JOB}_0.png`, 'audio'],
    ] as const) {
      expect(matchFile(name, kind, targets)).toEqual({ reason: 'Not a Midjourney or Suno name.', candidates: [] });
    }
  });
});

describe('matchTargets', () => {
  const APPENDIX = `# L'Ancora di Sabaoth

## Appendice: immagini e musica

### S1. La casa che cede

visual: collapsed library

### S2. L'ordine di Donato

visual: ruined office
`;

  it('takes the prompts the board shows with a text, scenes first, and the scenes’ titles', () => {
    const doc = project({ document: APPENDIX });
    const add = (category: 'scene' | 'pc' | 'npc' | 'handout', prompt: string, sceneId?: string) =>
      addImagePrompt(
        doc,
        category === 'scene' ? { category, sceneId: sceneId ?? null, prompt } : { category, name: 'N', prompt },
        'claude',
      ).id;
    const handout = add('handout', 'handwritten letter');
    const npc = add('npc', 'portrait of an old priest');
    const s2 = add('scene', 'ruined office', 'S2');
    add('scene', '', 'S2');
    add('scene', 'collapsed cathedral facade', 'S6');
    const pc = add('pc', 'portrait of a young nurse');
    add('npc', '   ');
    const found = matchTargets(readDocumentBoard(doc));
    expect(found.prompts.map((p) => p.id)).toEqual([s2, pc, npc, handout]);
    expect(found.scenes).toEqual([
      { sceneId: 'S1', title: null },
      { sceneId: 'S2', title: null },
    ]);
    // S6 has no row: its prompt is kept, not shown, never matched.
    expect(matchFile(`steve_collapsed_cathedral_facade_${JOB}_0.png`, 'image', found)).toEqual({
      reason: 'No prompt starts with "collapsed cathedral facade".',
      candidates: [],
    });
  });
});
