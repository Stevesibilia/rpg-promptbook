// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import type { ImagePromptEntry, PromptRow } from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { ImageGenerationStatus } from '../src/api.js';
import { BoardContext, type BoardContextValue, type Generation } from '../src/board/context.js';
import { GeneratePanel } from '../src/board/GeneratePanel.js';
import type { ShownPrompt } from '../src/board/summary.js';
import type { StatusState } from '../src/board/useGeneration.js';

// The Generate panel asks the server to check the credentials when it opens
// with Atelier chosen, for Atelier's month and estimates
// (atelier-image-provider D13); with OpenRouter it does not.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const prompt: ShownPrompt = {
  row: {
    prompt: {
      id: 'p1',
      category: 'scene',
      sceneId: 'S2',
      name: null,
      prompt: 'A ruined office at dawn',
      by: 'claude',
      at: '',
      order: 0,
      chosenFileId: null,
    } as ImagePromptEntry,
    number: 1,
    images: [],
    chosen: null,
    status: 'wanted',
  } as PromptRow,
  scene: { sceneId: 'S2', title: "L'ambulatorio" },
};

const ready = (provider: 'atelier' | 'openrouter'): StatusState => ({
  state: 'ready',
  status: {
    configured: true,
    key: { hint: 'a41f', checkedAt: '', limitRemaining: null },
    spending: { month: { images: 0, cost: 0 }, all: { images: 0, cost: 0 }, projects: [] },
    provider,
    atelier: {
      available: true,
      url: 'https://atelier.test',
      token: { hint: '7c1d', checkedAt: '', name: null, expiresAt: null, month: null, estimates: null },
    },
  } satisfies ImageGenerationStatus,
});

let root: Root;
let host: HTMLElement;

function show(status: StatusState, checkStatus: () => void) {
  const generation = {
    user: 'u1',
    offline: false,
    status,
    retryStatus: () => {},
    checkStatus,
    projectTitle: 'Sabaoth',
    defaults: { model: 'gpt', count: 2 },
    jobs: new Map(),
    pending: new Map(),
    shapes: new Map(),
    start: async () => null,
    spending: null,
    spendingTitle: '',
    open: 'p1',
    setOpen: () => {},
  } satisfies Generation;
  const value = { doc: new Y.Doc(), generation } as unknown as BoardContextValue;
  root.render(
    createElement(
      MemoryRouter,
      null,
      createElement(BoardContext.Provider, { value }, createElement(GeneratePanel, { prompt, button: createRef<HTMLButtonElement>() })),
    ),
  );
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the panel opening', () => {
  it('with Atelier chosen: checks once, also when the answer redraws it', async () => {
    const check = vi.fn();
    await act(async () => show(ready('atelier'), check));
    await act(async () => show(ready('atelier'), check));
    expect(check).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Through Atelier · into the collection «Sabaoth» Change');
  });

  it('with OpenRouter chosen: no check', async () => {
    const check = vi.fn();
    await act(async () => show(ready('openrouter'), check));
    expect(check).not.toHaveBeenCalled();
  });

  it('while the status loads: checks once it says Atelier', async () => {
    const check = vi.fn();
    await act(async () => show({ state: 'loading' }, check));
    expect(check).not.toHaveBeenCalled();
    await act(async () => show(ready('atelier'), check));
    expect(check).toHaveBeenCalledOnce();
  });
});
