import type { ResearchNote } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { notesFor, scenesFor, wordsOf } from '../src/research/match.js';

const note = (id: string, topic: string, editedAt = '2026-10-12T10:00:00.000Z'): ResearchNote => ({
  id,
  topic,
  summary: '',
  facts: [],
  sources: [],
  by: 'claude',
  at: editedAt,
  editedAt,
});

describe('wordsOf', () => {
  it('keeps runs of four letters or digits, without case or accents', () => {
    expect([...wordsOf('Il terremoto del 1908, nel PORTO; città')]).toEqual(['terremoto', '1908', 'porto', 'citta']);
  });

  it('counts a letter with its accent as one, before and after', () => {
    expect(wordsOf('Città').has('citta')).toBe(true);
    expect(wordsOf('Cittá').has('citta')).toBe(true);
    expect(wordsOf('più')).toEqual(new Set());
  });

  it('splits at punctuation and apostrophes', () => {
    expect([...wordsOf("l'ambulatorio di Salvi: 5:20")]).toEqual(['ambulatorio', 'salvi']);
  });
});

describe('notesFor', () => {
  const s1 = 'La casa crolla. Dal porto sale un rumore; il terremoto del 1908 non finisce.';
  const notes = [
    note('n1', 'Il terremoto del 1908: cronologia'),
    note('n2', 'Il maremoto nel porto di Messina'),
    note('n3', 'Colapesce'),
  ];

  it('lists the notes sharing a word, most words first, with the words the topic spells', () => {
    expect(notesFor(s1, notes)).toEqual([
      { note: notes[0], words: ['terremoto', '1908'] },
      { note: notes[1], words: ['porto'] },
    ]);
  });

  it('ignores words shorter than four letters', () => {
    expect(notesFor('il porto del re', [note('a', 'Il re del mare')])).toEqual([]);
  });

  it('breaks ties by the newest edit, then by id, and keeps at most the limit', () => {
    const older = note('b', 'Porto vecchio', '2026-10-10T10:00:00.000Z');
    const newer = note('c', 'Porto nuovo', '2026-10-14T10:00:00.000Z');
    const same = note('a', 'Porto franco', '2026-10-14T10:00:00.000Z');
    expect(notesFor('il porto', [older, newer, same]).map((m) => m.note.id)).toEqual(['a', 'c', 'b']);
    expect(notesFor('il porto', [older, newer, same], 2).map((m) => m.note.id)).toEqual(['a', 'c']);
  });

  it('matches Messina in a topic with MESSINA in the scene', () => {
    expect(notesFor('MESSINA', [note('a', 'Il porto di Messina')])[0]!.words).toEqual(['Messina']);
  });
});

describe('scenesFor', () => {
  const scenes = [
    { id: 'S1', text: '### S1. La casa che cede\nDal porto sale un rumore.' },
    { id: 'S2', text: "### S2. L'ambulatorio di Salvi" },
    { id: 'S4', text: '### S4. Torre Faro\nIl porto dei pescatori.' },
  ];

  it('names the scenes that share a word with the topic', () => {
    expect(scenesFor('Il maremoto nel porto di Messina', scenes)).toEqual(['S1', 'S4']);
    expect(scenesFor('Colapesce', scenes)).toEqual([]);
    expect(scenesFor('', scenes)).toEqual([]);
  });
});
