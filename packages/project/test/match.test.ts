import { describe, expect, it } from 'vitest';
import { matchFile, matchKey, parseMidjourney, parseSuno, type MatchRow } from '../src/index.js';

const JOB = '8c1e2f40-1b2a-4c3d-9e8f-0a1b2c3d4e5f';

// The mockup's scenes (docs/mockups/board.html).
const rows: MatchRow[] = [
  {
    sceneId: 'S1',
    image: { prompt: 'collapsed 1900s Sicilian library at night, broken beams, books buried in dust --ar 16:9 --v 8.1' },
    music: { title: 'Cinque e venti' },
  },
  {
    sceneId: 'S2',
    image: { prompt: "ruined doctor's office in 1908 Messina, anatomical drawings of a sea strait --ar 16:9 --v 8.1" },
    music: { title: 'Anatomia dello Stretto' },
  },
  {
    sceneId: 'S3',
    image: { prompt: 'collapsed cathedral facade in 1908 Messina, Italian soldiers --ar 16:9 --v 8.1' },
    music: { title: 'Ordini del Re' },
  },
  { sceneId: 'S4', image: null, music: { title: 'Città più già' } },
  { sceneId: 'S5', image: { prompt: 'Città sul mare, all’alba' }, music: null },
];

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
  it('finds the one scene whose prompt starts with the words', () => {
    expect(matchFile(`steve_collapsed_1900s_Sicilian_library_at_night_${JOB}_0.png`, 'image', rows)).toEqual({
      sceneId: 'S1',
      matchedBy: 'prompt',
    });
  });

  it('matches across the apostrophe Midjourney drops', () => {
    const name = `steve_ruined_doctors_office_in_1908_Messina_anatomical_${JOB}_1.png`;
    expect(matchFile(name, 'image', rows)).toEqual({ sceneId: 'S2', matchedBy: 'prompt' });
  });

  it('matches words cut mid-word', () => {
    expect(matchFile(`steve_collapsed_cathedral_fac_${JOB}_3.png`, 'image', rows)).toEqual({
      sceneId: 'S3',
      matchedBy: 'prompt',
    });
  });

  it('matches across accents', () => {
    expect(matchFile(`steve_Citta_sul_mare_${JOB}_0.webp`, 'image', rows)).toEqual({ sceneId: 'S5', matchedBy: 'prompt' });
    expect(matchFile('citta piu gia.mp3', 'audio', rows)).toEqual({ sceneId: 'S4', matchedBy: 'title' });
  });

  it('says why when no prompt or several start with the words', () => {
    expect(matchFile(`steve_a_vast_cathedral_nave_flooded_with_seawater_${JOB}_2.png`, 'image', rows)).toEqual({
      reason: 'No prompt starts with "a vast cathedral nave flooded".',
    });
    expect(matchFile(`steve_collapsed_${JOB}_2.png`, 'image', rows)).toEqual({
      reason: 'Several prompts start with "collapsed".',
    });
  });

  it('drops the words of a user name with underscores, while 12 key characters remain', () => {
    expect(matchFile(`john_doe_ruined_doctors_office_${JOB}_1.png`, 'image', rows)).toEqual({
      sceneId: 'S2',
      matchedBy: 'prompt',
    });
    expect(matchFile(`john_doe_smith_ruined_doctors_office_${JOB}_1.png`, 'image', rows)).toEqual({
      sceneId: 'S2',
      matchedBy: 'prompt',
    });
    // "ruined" alone is too short to trust.
    expect(matchFile(`john_doe_ruined_${JOB}_1.png`, 'image', rows)).toEqual({
      reason: 'No prompt starts with "doe ruined".',
    });
  });

  it('finds a track by its title, a second take too', () => {
    expect(matchFile('cinque e venti.mp3', 'audio', rows)).toEqual({ sceneId: 'S1', matchedBy: 'title' });
    expect(matchFile('Ordini del re (1).mp3', 'audio', rows)).toEqual({ sceneId: 'S3', matchedBy: 'title' });
    expect(matchFile('untitled track.mp3', 'audio', rows)).toEqual({ reason: 'No track title "untitled track".' });
  });

  it('matches no track whose title two scenes share', () => {
    const shared = [...rows, { sceneId: 'S6', image: null, music: { title: 'Cinque e Venti!' } }];
    expect(matchFile('cinque e venti (1).mp3', 'audio', shared)).toEqual({
      reason: 'Several scenes have the track title "cinque e venti".',
    });
  });

  it('leaves other names unmatched', () => {
    for (const [name, kind] of [
      ['IMG_2031.png', 'image'],
      ['cinque e venti.mp3', 'image'],
      [`steve_collapsed_1900s_${JOB}_0.png`, 'audio'],
    ] as const) {
      expect(matchFile(name, kind, rows)).toEqual({ reason: 'Not a Midjourney or Suno name.' });
    }
  });
});
