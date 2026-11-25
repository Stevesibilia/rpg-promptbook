import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CuebardSummary } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import { cuebardState, CuebardSummaryView, savedToast, TOO_LARGE, type CuebardState } from '../src/export/CuebardDialog.js';

// «Export for CueBard» (cuebard-export design decisions 16 and 17): the
// dialog's lines and warnings from a summary, its states, the toasts.

const summary = (patch: Partial<CuebardSummary> = {}): CuebardSummary => ({
  groups: 6,
  general: false,
  tracks: 5,
  images: { scene: 8, general: 0, pc: 4, npc: 3, handout: 2 },
  bytes: 1_000_000,
  empty: false,
  warnings: [],
  ...patch,
});

// The body as text, tags dropped, the bold parts marked with *.
function text(
  s: CuebardSummary,
  {
    state,
    desktop = false,
    campaign = false,
    fileName = "L'Ancora di Sabaoth.cbpack",
  }: { state?: CuebardState; desktop?: boolean; campaign?: boolean; fileName?: string } = {},
): string {
  const html = renderToStaticMarkup(
    createElement(CuebardSummaryView, {
      summary: s,
      state: state ?? cuebardState(s, 10),
      fileName,
      desktop,
      campaign,
    }),
  );
  return html
    .replace(/<\/?b>/g, '*')
    .replace(/<\/(p|dd|dt|li|h4|div)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\n+/g, '\n')
    .trim();
}

describe('the CueBard dialog', () => {
  it('shows the cue groups and the visual folders, the rule, and where the pack is built', () => {
    expect(text(summary()).split('\n')).toEqual([
      'A CueBard project: one cue group per scene, with its tracks, then one group General for the music of the whole adventure, and the images in five visual folders.',
      'Cue groups',
      '*6* scenes·no General group·*5* tracks',
      'Visual folders',
      'Scenes *8*·General *0*·PCs *4*·NPCs *3*·Handouts *2* images',
      'Each prompt and scene gives its chosen file, or every matched file when nothing is chosen. General images are not linked to a track. The Unmatched tray stays out.',
      "Your browser downloads L'Ancora di Sabaoth.cbpack",
    ]);
    expect(text(summary({ groups: 1, tracks: 1 }))).toContain('*1* scene·no General group·*1* track');
    // The General group counts in groups, not among the scenes.
    expect(text(summary({ groups: 7, general: true, tracks: 9 }))).toContain('*6* scenes·General·*9* tracks');
    expect(text(summary(), { desktop: true })).toMatch(/\nBuilt on this device, works offline\.$/);
  });

  it('lists one warning per gap, in the order given', () => {
    const lines = text(
      summary({
        warnings: [
          { kind: 'no-image', category: 'scene', label: 'S1. La casa che cede', number: 2, name: null },
          { kind: 'no-duration', sceneId: 'S3', label: 'S3. Il cordone', fileId: 'f1', fileName: 'Il cordone.mp3' },
          { kind: 'no-track', sceneId: 'S4', label: 'S4. Torre Faro e la canzone' },
          { kind: 'no-image', category: 'npc', label: 'NPC "Za\' Nina"', number: null, name: "Za' Nina" },
          { kind: 'no-image', category: 'handout', label: 'Handout "Lettera"', number: null, name: 'Lettera' },
          { kind: 'missing', fileId: 'f2', fileName: 'altrove.png', label: 'PC "Rosalia"' },
          { kind: 'no-image', category: 'general', label: 'General "Copertina"', number: null, name: 'Copertina' },
          { kind: 'no-track', musicId: 'm1', label: 'La scossa' },
          { kind: 'no-duration', musicId: 'm2', label: 'Tra le macerie', fileId: 'f3', fileName: 'tra le macerie.mp3' },
        ],
      }),
    ).split('\n');
    const start = lines.indexOf('9 warnings');
    expect(start).toBeGreaterThan(0);
    expect(lines.slice(start + 1, start + 10)).toEqual([
      '*S1. La casa che cede*, prompt 2, has no image.',
      '*S3. Il cordone*: the length of "Il cordone.mp3" is not recorded; the export reads it from the file, or leaves the track out.',
      '*S4. Torre Faro e la canzone* has no track: its cue group is empty.',
      'NPC *"Za\' Nina"* has no image.',
      'Handout *"Lettera"* has no image.',
      '*PC "Rosalia"*: "altrove.png" is not available, so it is left out.',
      'General *"Copertina"* has no image.',
      'General music *"La scossa"* has no track.',
      'General *"Tra le macerie"*: the length of "tra le macerie.mp3" is unknown, so it is left out.',
    ]);
    expect(text(summary({ warnings: [{ kind: 'no-track', sceneId: 'S4', label: 'S4. X' }] }))).toContain('\n1 warning\n');
  });

  // campaign-board design decision 11, screen 11b.
  it('shows a campaign with its one group General and four folders, naming no scene', () => {
    const kulthos = summary({
      groups: 1,
      general: true,
      tracks: 3,
      images: { scene: 0, general: 1, pc: 5, npc: 9, handout: 5 },
      warnings: [
        { kind: 'no-image', category: 'general', label: 'General "Il mare che guarda"', number: null, name: 'Il mare che guarda' },
        { kind: 'no-track', musicId: 'm3', label: 'Riposo alla locanda' },
      ],
    });
    expect(text(kulthos, { campaign: true, fileName: 'Kulthos.cbpack' }).split('\n')).toEqual([
      "A CueBard project: one cue group General with the campaign's music, and the images in four visual folders.",
      'Cue groups',
      'General·*3* tracks',
      'Visual folders',
      'General *1*·PCs *5*·NPCs *9*·Handouts *5* images',
      'Each prompt and music prompt gives its chosen file, or every matched file when nothing is chosen. General images are not linked to a track. The Unmatched tray stays out.',
      '2 warnings',
      'General *"Il mare che guarda"* has no image.',
      'General music *"Riposo alla locanda"* has no track.',
      'Your browser downloads Kulthos.cbpack',
    ]);
    const noTrack = summary({ groups: 0, general: false, tracks: 0, images: { scene: 0, general: 2, pc: 0, npc: 0, handout: 0 } });
    expect(text(noTrack, { campaign: true })).toContain('\nno General group·*0* tracks\n');
    const empty = summary({ groups: 0, tracks: 0, images: { scene: 0, general: 0, pc: 0, npc: 0, handout: 0 }, bytes: 0, empty: true });
    expect(text(empty, { campaign: true }).split('\n')).toEqual([
      "A CueBard project: one cue group General with the campaign's music, and the images in four visual folders.",
      'Nothing to export yet: add files to the board first.',
    ]);
  });

  it('says there is nothing to export when nothing is picked', () => {
    const empty = summary({ groups: 3, tracks: 0, images: { scene: 0, general: 0, pc: 0, npc: 0, handout: 0 }, bytes: 0, empty: true });
    expect(cuebardState(empty, 0)).toBe('empty');
    expect(text(empty).split('\n')).toEqual([
      'A CueBard project: one cue group per scene, with its tracks, then one group General for the music of the whole adventure, and the images in five visual folders.',
      'Nothing to export yet: add files to the board first.',
    ]);
  });

  it('refuses a pack past 4 GB or 65,000 entries with the server\'s message, and lets the rest through', () => {
    expect(cuebardState(summary({ bytes: 4_000_000_000 }), 10)).toBe('ready');
    expect(cuebardState(summary({ bytes: 4_000_000_001 }), 10)).toBe('too-large');
    expect(cuebardState(summary(), 64_998)).toBe('ready');
    expect(cuebardState(summary(), 64_999)).toBe('too-large');
    expect(text(summary({ bytes: 5e9 }))).toContain(`\n${TOO_LARGE}\n`);
    // Warnings never block.
    expect(cuebardState(summary({ warnings: [{ kind: 'no-track', sceneId: 'S1', label: 'S1' }] }), 1)).toBe('ready');
  });

  it('toasts the download, the save, what was left out, and nothing when cancelled', () => {
    const name = "L'Ancora di Sabaoth.cbpack";
    expect(savedToast('web', name, { saved: true, leftOut: 0, name })).toBe(`Downloading ${name}.`);
    expect(savedToast('desktop', name, { saved: true, leftOut: 0, name })).toBe(`Saved ${name}.`);
    // Renamed in the save dialog: the file as saved.
    expect(savedToast('desktop', name, { saved: true, leftOut: 0, name: 'Sabaoth.cbpack' })).toBe('Saved Sabaoth.cbpack.');
    expect(savedToast('desktop', name, { saved: true, leftOut: 2, name })).toBe(
      `Saved ${name}. 2 files were left out; the pack's left-out.txt lists them.`,
    );
    expect(savedToast('desktop', name, { saved: true, leftOut: 1, name })).toBe(
      `Saved ${name}. 1 file was left out; the pack's left-out.txt lists them.`,
    );
    expect(savedToast('desktop', name, { saved: false, leftOut: 0, name: '' })).toBeNull();
  });
});
