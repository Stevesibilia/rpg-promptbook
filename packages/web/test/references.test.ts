// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import {
  addFiles,
  addImagePrompt,
  readFiles,
  readImagePrompts,
  setPromptReferences,
  type FileEntry,
  type BoardRow,
  type ImagePromptEntry,
  type NewFile,
  type PromptRow,
} from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardContext, type BoardContextValue } from '../src/board/context.js';
import { priceLine } from '../src/board/generate.js';
import { ReferencesBlock, ReferencesLine } from '../src/board/ReferencePicker.js';
import {
  addLabel,
  AT_MOST,
  boardImages,
  cardLine,
  imageLabel,
  missingLine,
  NOT_ON_SERVER,
  referenceLabels,
  referencesHint,
  referencesRow,
  tileState,
  togglePick,
} from '../src/board/references.js';
import { shownPrompts, type ShownPrompt } from '../src/board/summary.js';

// Reference images on a prompt (reference-images design decisions 12 to
// 17): the labels, the picker's order and rules, the lines that name them,
// and the panel's block writing to the prompt.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hash = (n: number) => n.toString(16).padStart(64, '0');

const file = (id: string, patch: Partial<FileEntry> = {}): FileEntry =>
  ({
    id,
    sha256: hash(id.length + id.charCodeAt(0)),
    thumbSha256: null,
    name: `${id}.png`,
    kind: 'image',
    mime: 'image/png',
    size: 1000,
    width: 1024,
    height: 1024,
    duration: null,
    sceneId: null,
    promptId: null,
    matchedBy: 'hand',
    addedBy: 'user',
    addedAt: '2026-11-17T09:00:00.000Z',
    generatedModel: null,
    cost: null,
    generatedVia: null,
    atelierImageId: null,
    references: null,
    ...patch,
  }) as FileEntry;

const entry = (patch: Partial<ImagePromptEntry>): ImagePromptEntry => ({
  id: 'p',
  category: 'scene',
  sceneId: 'S1',
  name: null,
  prompt: 'A ruined office at dawn',
  by: 'claude',
  at: '',
  order: 0,
  chosenFileId: null,
  references: [],
  missingReferences: 0,
  ...patch,
});

const shownPrompt = (
  p: Partial<ImagePromptEntry>,
  number: number,
  images: FileEntry[],
  chosen: string | null = null,
  scene: ShownPrompt['scene'] = null,
): ShownPrompt => ({
  row: { prompt: entry(p), number, images, chosen, status: images.length ? 'received' : 'wanted' } as PromptRow,
  scene,
});

// A board: S1's prompt 2 with two images, the second chosen; an NPC with
// one image, chosen; a handout with none.
const s1a = file('s1a');
const s1b = file('s1b');
const npc = file('npc');
const shown = new Map<string, ShownPrompt>([
  ['p1', shownPrompt({ id: 'p1' }, 2, [s1a, s1b], 's1b', { sceneId: 'S1', title: 'La casa che cede' })],
  ['p2', shownPrompt({ id: 'p2', category: 'npc', name: 'Padre Anselmo' }, 1, [npc], 'npc')],
  ['p3', shownPrompt({ id: 'p3', category: 'handout', name: null }, 1, [])],
]);

describe('the labels', () => {
  it('names an image by its prompt: «S1 · 2», or the name, or «New NPC»', () => {
    expect(imageLabel(shown.get('p1')!)).toBe('S1 · 2');
    expect(imageLabel(shown.get('p2')!)).toBe('Padre Anselmo');
    expect(imageLabel(shownPrompt({ category: 'npc', name: null }, 3, []))).toBe('New NPC');
  });

  it('names an image in the Unmatched tray by its file name, cut at 40 characters', () => {
    const tray = file('tray', { name: `${'a'.repeat(45)}.png` });
    const audio = file('audio', { kind: 'audio' });
    const labels = referenceLabels(shown, [s1a, s1b, npc, tray, audio]);
    expect(labels.get('s1a')).toBe('S1 · 2');
    expect(labels.get('npc')).toBe('Padre Anselmo');
    expect(labels.get('tray')).toBe(`${'a'.repeat(40)}…`);
    expect(labels.has('audio')).toBe(false);
  });
});

describe('the picker', () => {
  it('lists the chosen images first, then the others in board order', () => {
    expect(boardImages(shown).map((i) => [i.file.id, i.label, i.chosen])).toEqual([
      ['s1b', 'S1 · 2', true],
      ['npc', 'Padre Anselmo', true],
      ['s1a', 'S1 · 2', false],
    ]);
  });

  it('offers the General images too, after the scenes and before the PCs, by their name', () => {
    const cover = file('cover');
    const untitled = file('untitled');
    const sceneRow = shown.get('p1')!;
    const all = shownPrompts([{ sceneId: 'S1', title: 'La casa che cede', prompts: [sceneRow.row] } as unknown as BoardRow], {
      general: [
        shownPrompt({ id: 'g1', category: 'general', sceneId: null, name: 'Copertina' }, 1, [cover]).row,
        shownPrompt({ id: 'g2', category: 'general', sceneId: null, name: null }, 2, [untitled]).row,
      ],
      pc: [],
      npc: [shown.get('p2')!.row],
      handout: [],
    });
    expect(boardImages(all).map((i) => [i.file.id, i.label, i.chosen])).toEqual([
      ['s1b', 'S1 · 2', true],
      ['npc', 'Padre Anselmo', true],
      ['s1a', 'S1 · 2', false],
      ['cover', 'Copertina', false],
      ['untitled', 'New image', false],
    ]);
    expect(cardLine(['cover', 'npc'], referenceLabels(all, [cover, npc]))).toBe('References: Copertina, Padre Anselmo');
  });

  // campaign-board design decision 16: a campaign's board shows no scene, and
  // its General, PC, NPC and handout images are the references offered.
  it("offers a campaign's General, PC, NPC and handout images", () => {
    const cover = file('cover');
    const elsa = file('elsa');
    const poster = file('poster');
    const campaign = shownPrompts([], {
      general: [shownPrompt({ id: 'g1', category: 'general', sceneId: null, name: 'Copertina della campagna' }, 1, [cover]).row],
      pc: [shownPrompt({ id: 'c1', category: 'pc', sceneId: null, name: 'Elsa Lindqvist' }, 1, [elsa], 'elsa').row],
      npc: [shown.get('p2')!.row],
      handout: [shownPrompt({ id: 'h1', category: 'handout', sceneId: null, name: 'Avviso di ricerca' }, 1, [poster]).row],
    });
    expect(boardImages(campaign).map((i) => [i.file.id, i.label, i.chosen])).toEqual([
      ['elsa', 'Elsa Lindqvist', true],
      ['npc', 'Padre Anselmo', true],
      ['cover', 'Copertina della campagna', false],
      ['poster', 'Avviso di ricerca', false],
    ]);
    expect(cardLine(['cover', 'elsa'], referenceLabels(campaign, [cover, elsa]))).toBe(
      'References: Copertina della campagna, Elsa Lindqvist',
    );
  });

  it('turns a tile off when its image is only on this device, or when three are picked', () => {
    expect(tileState('a', [], false)).toEqual({ selected: false, disabled: null });
    expect(tileState('a', ['a'], false)).toEqual({ selected: true, disabled: null });
    expect(tileState('a', [], true)).toEqual({ selected: false, disabled: NOT_ON_SERVER });
    expect(tileState('d', ['a', 'b', 'c'], false)).toEqual({ selected: false, disabled: '3 references at most' });
    expect(AT_MOST).toBe('3 references at most');
    expect(NOT_ON_SERVER).toBe('Not on the server yet');
    // A picked one can be unpicked even at three, even when only here.
    expect(tileState('c', ['a', 'b', 'c'], true)).toEqual({ selected: true, disabled: null });
  });

  it('picks at the end, unpicks in place, and never picks a fourth', () => {
    expect(togglePick([], 'a')).toEqual(['a']);
    expect(togglePick(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(togglePick(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(togglePick(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
  });

  it('says how many are picked, and what Add reads', () => {
    expect(referencesHint(0)).toBe('up to 3, from this board');
    expect(referencesHint(1)).toBe('1 of 3');
    expect(addLabel(0)).toBe('+ Add an image');
    expect(addLabel(2)).toBe('+ Add');
    expect(missingLine(1)).toBe('1 reference no longer on the board');
    expect(missingLine(2)).toBe('2 references no longer on the board');
  });
});

describe('the lines that name them', () => {
  const labels = referenceLabels(shown, [s1a, s1b, npc]);

  it('the prompt card: «References: Padre Anselmo, S1 · 2», nothing with none', () => {
    expect(cardLine(['npc', 's1a'], labels)).toBe('References: Padre Anselmo, S1 · 2');
    expect(cardLine([], labels)).toBeNull();
    expect(cardLine(['gone'], labels)).toBeNull();
  });

  it('the viewer: the labels still on the board, then how many were removed', () => {
    expect(referencesRow(['npc'], labels)).toEqual({ label: 'References', value: 'Padre Anselmo' });
    expect(referencesRow(['npc', 'gone', 's1b'], labels)).toEqual({
      label: 'References',
      value: 'Padre Anselmo, S1 · 2, 1 removed',
    });
    expect(referencesRow(['gone', 'also gone'], labels)?.value).toBe('2 removed');
    expect(referencesRow(null, labels)).toBeNull();
    expect(referencesRow([], labels)).toBeNull();
  });

  it('the estimate keeps its number and says the input images are extra', () => {
    expect(priceLine({ model: 'gpt', count: 2 }, null, 0)).toEqual({ amount: '$0.08', extra: '', text: 'About $0.08 · 1K' });
    expect(priceLine({ model: 'gpt', count: 2 }, null, 2).text).toBe('About $0.08 · 1K · plus the input images');
  });
});

// The block in the panel, on a real document: picks and removals write to
// the prompt at once.
describe('the References block', () => {
  let root: Root;
  let host: HTMLElement;
  let doc: Y.Doc;
  let ids: string[];
  let promptId: string;

  const image = (n: number, promptId: string | null): NewFile => ({
    sha256: hash(n),
    thumbSha256: null,
    name: `image_${n}.png`,
    kind: 'image',
    mime: 'image/png',
    size: 1000,
    width: 1024,
    height: 1024,
    duration: null,
    sceneId: null,
    promptId,
    matchedBy: promptId ? 'hand' : null,
    addedBy: 'user',
  });

  // The board as drawn from the document now.
  function board(): Map<string, ShownPrompt> {
    const files = readFiles(doc);
    const map = new Map<string, ShownPrompt>();
    for (const p of readImagePrompts(doc)) {
      const images = files.filter((f) => f.promptId === p.id);
      map.set(p.id, shownPrompt(p, 1, images, p.chosenFileId, p.category === 'scene' ? { sceneId: 'S2', title: 'x' } : null));
    }
    return map;
  }

  const refs = () => readImagePrompts(doc).find((p) => p.id === promptId)!;

  function render(part: 'block' | 'line' = 'block') {
    const shown = board();
    const value = {
      doc,
      projectId: 'proj',
      shown,
      files: readFiles(doc),
      toast: () => {},
    } as unknown as BoardContextValue;
    act(() =>
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(
            BoardContext.Provider,
            { value },
            createElement(part === 'block' ? ReferencesBlock : ReferencesLine, { entry: refs() }),
          ),
        ),
      ),
    );
  }

  const options = () => [...host.querySelectorAll<HTMLButtonElement>('[role=option]')];
  const click = (el: Element) => act(() => (el as HTMLElement).click());
  const add = () => host.querySelector<HTMLButtonElement>('.refadd');

  beforeEach(() => {
    doc = new Y.Doc();
    promptId = addImagePrompt(doc, { category: 'scene', sceneId: 'S2', prompt: 'A ruined office at dawn' }, 'claude').id;
    const anselmo = addImagePrompt(doc, { category: 'npc', name: 'Padre Anselmo', prompt: 'An old priest' }, 'claude').id;
    const donato = addImagePrompt(doc, { category: 'npc', name: 'Capitano Donato', prompt: 'A captain' }, 'claude').id;
    const added = addFiles(doc, [image(1, anselmo), image(2, donato), image(3, donato), image(4, donato)]).added;
    ids = added.map((f) => f.id);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('starts empty, opens the grid as a listbox, and remembers a pick on the prompt', () => {
    render();
    expect(host.querySelector('.gl')?.textContent).toBe('References up to 3, from this board');
    expect(add()?.textContent).toBe('+ Add an image');
    expect(add()?.getAttribute('aria-expanded')).toBe('false');
    click(add()!);
    const grid = host.querySelector('[role=listbox]')!;
    expect(grid.getAttribute('aria-label')).toBe('Images on this board');
    expect(grid.getAttribute('aria-multiselectable')).toBe('true');
    expect(options().map((o) => o.textContent)).toEqual(['Padre Anselmo', 'Capitano Donato', 'Capitano Donato', 'Capitano Donato']);
    // One tile in the tab order.
    expect(options().map((o) => o.tabIndex)).toEqual([0, -1, -1, -1]);
    click(options()[0]!);
    expect(refs().references).toEqual([ids[0]]);
    render();
    expect(host.querySelector('.gl')?.textContent).toBe('References 1 of 3');
    expect(host.querySelector('.ref .rl')?.textContent).toBe('Padre Anselmo');
    expect(options()[0]!.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.refnote')?.textContent).toBe('Sent with the prompt and kept on this prompt for next time.');
    expect(add()?.textContent).toBe('+ Add');
  });

  it('at three: «+ Add» goes, the grid stays open with the others off and saying why', () => {
    render();
    click(add()!);
    // The tiles' files: Donato's three images are in the order of their ids.
    const order = boardImages(board()).map((i) => i.file.id);
    for (const i of [0, 1, 2]) {
      click(options()[i]!);
      render();
    }
    expect(refs().references).toEqual(order.slice(0, 3));
    expect(add()).toBeNull();
    const last = options()[3]!;
    expect(last.getAttribute('aria-disabled')).toBe('true');
    expect(last.title).toBe('3 references at most');
    click(last);
    expect(refs().references).toHaveLength(3);
    // Unpicking in the grid brings «+ Add» back.
    click(options()[1]!);
    render();
    expect(refs().references).toEqual([order[0], order[2]]);
    expect(add()?.textContent).toBe('+ Add');
  });

  it('moves with the arrows, picks with Enter, closes the grid alone with Escape', () => {
    render();
    click(add()!);
    const grid = host.querySelector<HTMLElement>('[role=listbox]')!;
    options()[0]!.focus();
    act(() => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(options()[3]);
    act(() => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(document.activeElement).toBe(options()[2]);
    expect(options().map((o) => o.tabIndex)).toEqual([-1, -1, 0, -1]);
    let reachedDocument = false;
    const listener = () => (reachedDocument = true);
    document.addEventListener('keydown', listener);
    act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    document.removeEventListener('keydown', listener);
    expect(host.querySelector('[role=listbox]')).toBeNull();
    // The panel's own Escape never hears it.
    expect(reachedDocument).toBe(false);
    expect(document.activeElement).toBe(add());
  });

  it('removes a reference with its ✕', () => {
    setPromptReferences(doc, promptId, [ids[0]!, ids[1]!], 'user');
    render();
    const remove = host.querySelector<HTMLButtonElement>('.ref .rx')!;
    expect(remove.getAttribute('aria-label')).toBe('Remove Padre Anselmo');
    expect(remove.title).toBe('Remove this reference');
    click(remove);
    expect(refs().references).toEqual([ids[1]]);
  });

  it('says how many references left the board, and the next pick cleans them', () => {
    setPromptReferences(doc, promptId, [ids[0]!, ids[1]!], 'user');
    // The image removed from the board elsewhere.
    const files = doc.getArray<Y.Map<unknown>>('files');
    act(() => {
      files.delete(files.toArray().findIndex((m) => m.get('id') === ids[0]), 1);
    });
    expect(refs()).toMatchObject({ references: [ids[1]], missingReferences: 1 });
    render();
    expect(host.querySelector('.refgone')?.textContent).toBe('1 reference no longer on the board');
    click(add()!);
    click(options().find((o) => o.getAttribute('aria-selected') === 'false')!);
    expect(refs()).toMatchObject({ missingReferences: 0 });
    expect(refs().references).toHaveLength(2);
    expect(refs().references[0]).toBe(ids[1]);
    render();
    expect(host.querySelector('.refgone')).toBeNull();
  });

  it('puts the line on the prompt card, and none without references', () => {
    render('line');
    expect(host.querySelector('.refline')).toBeNull();
    setPromptReferences(doc, promptId, [ids[1]!, ids[0]!], 'user');
    render('line');
    expect(host.querySelector('.refline')?.textContent).toBe('References: Capitano Donato, Padre Anselmo');
  });
});
