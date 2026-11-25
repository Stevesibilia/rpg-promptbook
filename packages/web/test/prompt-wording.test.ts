import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { BoardRow } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { ImageGenerationStatus } from '../src/api.js';
import { addPrompt } from '../src/board/actions.js';
import { ClaudeCard } from '../src/board/ClaudeCard.js';
import { BoardContext, type BoardContextValue } from '../src/board/context.js';
import { missingCredential, promptWording, type PromptWording } from '../src/board/generate.js';
import { ImageHalf } from '../src/board/ImageHalf.js';
import { PromptBody } from '../src/board/ImagePrompt.js';
import { AddPromptEditor } from '../src/board/PromptEditor.js';
import { namedText, type ShownPrompt } from '../src/board/summary.js';

// generator-prompt-rules D8 to D10: the board says Midjourney only for an
// account known not to generate.

const status = (patch: Partial<ImageGenerationStatus> = {}): ImageGenerationStatus => ({
  configured: true,
  key: { hint: 'a41f', checkedAt: '2026-11-25T10:00:00.000Z', limitRemaining: null },
  spending: { month: { images: 0, cost: 0 }, all: { images: 0, cost: 0 }, projects: [] },
  provider: 'openrouter',
  atelier: { available: true, url: 'http://atelier.test', token: null },
  ...patch,
});

describe('promptWording', () => {
  it('is image while the status is unknown', () => {
    expect(promptWording(null)).toBe('image');
  });

  it('is midjourney for a server not configured, a missing key, Atelier without an address or a token', () => {
    expect(promptWording(status({ configured: false }))).toBe('midjourney');
    expect(promptWording(status({ key: null }))).toBe('midjourney');
    expect(promptWording(status({ provider: 'atelier' }))).toBe('midjourney');
    expect(promptWording(status({ provider: 'atelier', atelier: { available: false, url: null, token: null } }))).toBe('midjourney');
  });

  it('is image with a key saved, or an Atelier token', () => {
    expect(promptWording(status())).toBe('image');
    const token = { hint: 'x', checkedAt: '2026-11-25T10:00:00.000Z' } as unknown as NonNullable<ImageGenerationStatus['atelier']['token']>;
    expect(promptWording(status({ provider: 'atelier', key: null, atelier: { available: true, url: 'http://atelier.test', token } }))).toBe('image');
  });

  it('keeps missingCredential where the panel reads it', () => {
    expect(missingCredential(status())).toBeNull();
    expect(missingCredential(status({ key: null }))).not.toBeNull();
  });
});

describe('the words, both ways', () => {
  it('names the tabs’ prompts', () => {
    for (const category of ['pc', 'npc', 'handout'] as const) {
      expect(namedText(category, 'adventure').what).toMatch(/a name, then a Midjourney prompt\.$/);
      expect(namedText(category, 'adventure', 'midjourney').what).toMatch(/a name, then a Midjourney prompt\.$/);
      expect(namedText(category, 'adventure', 'image').what).toMatch(/a name, then an image prompt\.$/);
      expect(namedText(category, 'adventure', 'image').what).not.toContain('Midjourney');
    }
    expect(namedText('general', 'campaign', 'image').example).toBe('Copertina della campagna');
  });

  it('words the Add toast', () => {
    const doc = () => new Y.Doc();
    const scene = { category: 'scene', sceneId: 'S2' } as const;
    expect(addPrompt(doc(), scene, 'a pier', 'midjourney').said).toBe('Added S2 · prompt 1. Copy it into Midjourney.');
    expect(addPrompt(doc(), scene, 'a pier', 'image').said).toBe('Added S2 · prompt 1.');
    const npc = { category: 'npc', name: 'Padre Anselmo' } as const;
    expect(addPrompt(doc(), npc, 'a priest', 'midjourney').said).toBe('Added NPC · Padre Anselmo. Copy it into Midjourney.');
    expect(addPrompt(doc(), npc, 'a priest', 'image').said).toBe('Added NPC · Padre Anselmo.');
  });

  it('words the Claude card', () => {
    const card = (whole: 'adventure' | 'campaign', wording: PromptWording) =>
      text(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ClaudeCard, { title: 'T', whole, wording, onToast: () => {} }))));
    expect(card('adventure', 'image')).toContain('writes image prompts for the scenes');
    expect(card('adventure', 'midjourney')).toContain('writes Midjourney prompts for the scenes');
    expect(card('campaign', 'image')).toContain('and image prompts for the PCs');
    expect(card('campaign', 'image')).not.toContain('Midjourney');
    expect(card('campaign', 'midjourney')).toContain('and Midjourney prompts for the PCs');
  });
});

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

function context(wording: PromptWording, shown = new Map<string, ShownPrompt>()): BoardContextValue {
  return {
    doc: new Y.Doc(),
    projectId: 'proj',
    whole: 'adventure',
    rows: [],
    named: { general: [], pc: [], npc: [], handout: [] },
    shown,
    files: [],
    marks: new Set<string>(),
    toast: () => {},
    openViewer: () => {},
    mark: () => {},
    editing: new Set<string>(),
    setEditing: () => {},
    adding: null,
    setAdding: () => {},
    generation: { wording, offline: false, status: { state: 'loading' }, jobs: new Map(), pending: new Map(), shapes: new Map(), open: null, setOpen: () => {} },
  } as unknown as BoardContextValue;
}

const render = (wording: PromptWording, part: ReactElement, shown?: Map<string, ShownPrompt>) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BoardContext.Provider, { value: context(wording, shown) }, part)));

describe('the components, both ways', () => {
  const row = { sceneId: 'S2', title: 'La cripta', visual: 'a pier at dawn', prompts: [], music: null } as unknown as BoardRow;

  it('labels the scene row’s image half', () => {
    expect(text(render('image', createElement(ImageHalf, { row, filter: 'all' })))).toContain('Images');
    expect(text(render('image', createElement(ImageHalf, { row, filter: 'all' })))).not.toContain('Midjourney');
    expect(text(render('midjourney', createElement(ImageHalf, { row, filter: 'all' })))).toContain('Images · Midjourney');
  });

  it('labels the Add editor and its placeholder', () => {
    const add = (adding: { category: 'scene'; sceneId: string } | { category: 'npc' }) =>
      createElement(AddPromptEditor, { doc: new Y.Doc(), adding, onToast: () => {}, onDone: () => {} });
    const scene = { category: 'scene', sceneId: 'S2' } as const;
    const image = render('image', add(scene));
    expect(image).toContain('aria-label="Image prompt for S2 · prompt 1"');
    expect(image).toContain('placeholder="An image prompt for S2…"');
    const mj = render('midjourney', add(scene));
    expect(mj).toContain('aria-label="Midjourney prompt for S2 · prompt 1"');
    expect(mj).toContain('placeholder="A Midjourney prompt for S2…"');
    expect(render('image', add({ category: 'npc' }))).toContain('aria-label="Image prompt for the new NPC"');
    expect(render('midjourney', add({ category: 'npc' }))).toContain('aria-label="Midjourney prompt for the new NPC"');
  });

  it('words a migrated prompt with images and no text', () => {
    const shown: ShownPrompt = {
      row: { prompt: { id: 'p1', category: 'scene', sceneId: 'S2', name: null, prompt: '', by: 'user', at: '', order: 0, chosenFileId: null, references: [], missingReferences: 0 }, number: 1, images: [], chosen: null, status: 'wanted' },
      scene: { sceneId: 'S2', title: 'La cripta' },
    } as unknown as ShownPrompt;
    expect(text(render('image', createElement(PromptBody, { prompt: shown })))).toContain('No image prompt yet. Ask Claude, or write one.');
    expect(text(render('midjourney', createElement(PromptBody, { prompt: shown })))).toContain('No Midjourney prompt yet. Ask Claude, or write one.');
  });
});
