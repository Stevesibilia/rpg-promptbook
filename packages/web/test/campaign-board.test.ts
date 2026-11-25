// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import {
  addFiles,
  addImagePrompt,
  addMusicPrompt,
  generalMusic,
  namedPrompts,
  readFiles,
  readImagePrompts,
  readMusicPrompts,
  type NewFile,
} from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { Connect } from '../src/editor/analysis/client.js';
import { musicQuestion } from '../src/board/actions.js';
import { ClaudeCard, claudeRequest } from '../src/board/ClaudeCard.js';
import { MatchHelp } from '../src/board/MatchHelp.js';
import {
  boardTabs,
  namedText,
  shownPrompts,
  tabParam,
  trackGroups,
  trackPlaces,
  wholeOf,
} from '../src/board/summary.js';
import { trayFiles, useBoard, type Board } from '../src/board/useBoard.js';

// The board on a campaign (campaign-board design decisions 2 to 4): its
// tabs and opening tab, no parse, and the words that name the campaign and
// no scene.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track = (name: string, n: number, musicId: string | null): NewFile => ({
  sha256: n.toString(16).padStart(64, '0'),
  thumbSha256: null,
  name,
  kind: 'audio',
  mime: 'audio/mpeg',
  size: 1000,
  width: null,
  height: null,
  duration: 180,
  sceneId: null,
  musicId,
  promptId: null,
  matchedBy: musicId ? 'title' : null,
  addedBy: 'user',
});

// A campaign whose text holds what would be an adventure's appendix.
const APPENDIX = '# Kulthos\n\n## Appendice: immagini e musica\n\n### S1. La casa che cede\n\nvisual: a house\n\nmood: dark\n';

function campaign() {
  const doc = new Y.Doc();
  doc.getMap('meta').set('category', 'campaign');
  doc.getMap('meta').set('title', 'Kulthos');
  doc.getText('document').insert(0, APPENDIX);
  const cover = addImagePrompt(
    doc,
    { category: 'general', name: 'Copertina della campagna', prompt: 'an ancient bronze anchor half buried in black sand' },
    'claude',
  );
  const anselmo = addImagePrompt(doc, { category: 'npc', name: 'Padre Anselmo', prompt: 'portrait of an old priest' }, 'claude');
  const tema = addMusicPrompt(doc, { title: 'Tema della campagna', style: 'dark orchestral', lyrics: '[End]' }, 'claude');
  const combat = addMusicPrompt(doc, { title: 'Combattimento', style: 'percussive', lyrics: '[End]' }, 'claude');
  addFiles(doc, [
    track('tema della campagna.mp3', 1, tema.id),
    track('combattimento.mp3', 2, combat.id),
    track('combattimento (1).mp3', 3, combat.id),
    track('untitled track.mp3', 4, null),
  ]);
  return { doc, ids: { cover: cover.id, anselmo: anselmo.id, tema: tema.id, combat: combat.id } };
}

// The text of a static render, tags dropped.
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

describe('the tabs of a campaign', () => {
  it('shows General, PCs, NPCs and Handouts, and opens on General', () => {
    expect(boardTabs('campaign')).toEqual(['general', 'pcs', 'npcs', 'handouts']);
    expect(boardTabs('adventure')).toEqual(['scenes', 'general', 'pcs', 'npcs', 'handouts']);
    expect(boardTabs('one-shot')[0]).toBe('scenes');
    expect(tabParam(null, 'campaign')).toBe('general');
    expect(tabParam('general', 'campaign')).toBe('general');
    expect(tabParam('npcs', 'campaign')).toBe('npcs');
    // A campaign has no Scenes: the address opens General.
    expect(tabParam('scenes', 'campaign')).toBe('general');
    expect(tabParam('nope', 'campaign')).toBe('general');
    expect(tabParam('scenes', 'adventure')).toBe('scenes');
    expect(tabParam(null, 'one-shot')).toBe('scenes');
  });

  it('speaks of the campaign on General and keeps the other tabs as they are', () => {
    expect(wholeOf('campaign')).toBe('campaign');
    expect(wholeOf('one-shot')).toBe('adventure');
    expect(namedText('general', 'campaign')).toMatchObject({
      empty: 'Nothing general yet',
      what: 'Images and music for the whole campaign, not tied to a scene: establishing shots, a cover, a main theme, ambience, combat music.',
      example: 'Copertina della campagna',
    });
    expect(namedText('general', 'adventure').example).toBe('Messina dopo il terremoto');
    expect(namedText('npc', 'campaign')).toEqual(namedText('npc', 'adventure'));
  });
});

describe('the board of a campaign', () => {
  // The hook's value at each render, with a worker that must never start.
  function renderBoard(doc: Y.Doc, campaignBoard: boolean) {
    const seen: Board[] = [];
    let connected = 0;
    const connect = (() => {
      connected += 1;
      throw new Error('a campaign is never parsed');
    }) as unknown as Connect;
    function Probe() {
      seen.push(useBoard(doc, campaignBoard, connect));
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(createElement(Probe)));
    return { seen, connected: () => connected, unmount: () => act(() => root.unmount()) };
  }

  it('is loaded at the first render, with no rows and no worker, even with an appendix in its text', async () => {
    const { doc } = campaign();
    const { seen, connected, unmount } = renderBoard(doc, true);
    const first = seen[0]!;
    expect(first.parsed).not.toBeNull();
    expect(first.rows).toEqual([]);
    expect(connected()).toBe(0);
    const last = seen.at(-1)!;
    expect(last.named.general.map((p) => p.prompt.name)).toEqual(['Copertina della campagna']);
    expect(last.music.map((m) => [m.prompt.title, m.tracks.length])).toEqual([
      ['Tema della campagna', 1],
      ['Combattimento', 2],
    ]);
    expect(last.tray.map((t) => t.file.name)).toEqual(['untitled track.mp3']);
    // parseNow answers at once, with no scene.
    const parsed = await last.parseNow();
    expect(parsed.model.appendix).toEqual([]);
    expect(parsed.text).toBe(APPENDIX);
    unmount();
  });

  it('matches tracks to General music titles only, and offers them under General', () => {
    const { doc } = campaign();
    const named = namedPrompts(readImagePrompts(doc), readFiles(doc));
    const music = generalMusic(readMusicPrompts(doc), readFiles(doc), []);
    expect(trayFiles([], [], named, readImagePrompts(doc), readFiles(doc), music).map((t) => t.file.name)).toEqual([
      'untitled track.mp3',
    ]);
    expect(trackGroups(trackPlaces([], music)).map((g) => [g.label, g.options.map((o) => o.label)])).toEqual([
      ['General', ['Tema della campagna', 'Combattimento']],
    ]);
  });
});

describe('the words of a campaign', () => {
  it('asks before removing a music prompt with no scene to send its tracks to', () => {
    const { doc, ids } = campaign();
    const card = generalMusic(readMusicPrompts(doc), readFiles(doc), []).find((m) => m.prompt.id === ids.combat)!;
    expect(musicQuestion(card, 'campaign').note).toBe(
      'Its 2 tracks move to Unmatched, where you can assign them to another music prompt.',
    );
    expect(musicQuestion(card).note).toBe(
      'Its 2 tracks move to Unmatched, where you can assign them to a scene or another music prompt.',
    );
  });

  it('asks Claude for the campaign board', () => {
    expect(claudeRequest('Kulthos', 'campaign')).toBe(
      'Write the image and music prompts for the board of «Kulthos»: general images and music, portraits of the PCs and NPCs, and the handouts',
    );
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(ClaudeCard, { title: 'Kulthos', whole: 'campaign', wording: 'midjourney', onToast: () => {} })),
    );
    const text = textOf(html);
    expect(text).toContain(
      'Claude reads the campaign and writes General images and music for it, like a cover and a main theme, and Midjourney prompts for the PCs, the NPCs and the handouts. Ask in a chat on claude.ai:',
    );
    expect(text).not.toMatch(/scene/);
    const adventure = textOf(
      renderToStaticMarkup(
        createElement(MemoryRouter, null, createElement(ClaudeCard, { title: 'Sabaoth', whole: 'adventure', wording: 'midjourney', onToast: () => {} })),
      ),
    );
    expect(adventure).toContain('one Suno prompt per scene');
  });

  it('explains matching with no scene', () => {
    const { doc } = campaign();
    const named = namedPrompts(readImagePrompts(doc), readFiles(doc));
    const music = generalMusic(readMusicPrompts(doc), readFiles(doc), []);
    // A scene row given anyway is never used as an example on a campaign.
    const rows = [
      {
        sceneId: 'S1',
        title: 'La casa che cede',
        prompts: [],
        music: { title: 'Una scena' },
      },
    ] as never;
    const text = textOf(
      renderToStaticMarkup(
        createElement(MatchHelp, { rows, named, music, shown: shownPrompts([], named), whole: 'campaign', onClose: () => {} }),
      ),
    );
    expect(text).toContain(
      'The filename holds the first words of the prompt. They pick the prompt, in any category: General, PCs, NPCs or Handouts.',
    );
    expect(text).toContain('The filename is the track title of a General music prompt. A second take gets "(1)".');
    expect(text).toContain(
      'Start each prompt differently to avoid it. A track title used twice warns on both and its tracks wait in Unmatched.',
    );
    expect(text).toContain('tema della campagna .mp3 → General · Tema della campagna');
    expect(text).not.toMatch(/Scenes|scene|una scena/i);
  });
});
