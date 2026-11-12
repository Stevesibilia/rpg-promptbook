// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { defaultSettings, type Settings } from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ImageGenerationStatus } from '../src/api.js';
import { AuthContext, type Auth } from '../src/auth/context.js';
import { ImageGenerationSection } from '../src/settings/ImageGeneration.js';

// Settings → Image generation as the user clicks it (atelier-image-provider
// D5 and D13): choosing a provider saves it and toasts; removing the Atelier
// token while Atelier is chosen switches to OpenRouter when its key works.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status = (patch: Partial<ImageGenerationStatus> = {}): ImageGenerationStatus => ({
  configured: true,
  key: { hint: 'a41f', checkedAt: '2026-11-12T21:40:00.000Z', limitRemaining: 12.4 },
  spending: { month: { images: 0, cost: 0 }, all: { images: 0, cost: 0 }, projects: [] },
  provider: 'atelier',
  atelier: {
    available: true,
    url: 'https://atelier.siberio.eu',
    token: {
      hint: '7c1d',
      checkedAt: '2026-11-12T21:40:00.000Z',
      name: 'promptbook',
      expiresAt: '2027-11-12T12:00:00.000Z',
      month: { spent: 0.9, cap: 20 },
      estimates: { gpt: 0.083, nb: 0.037 },
    },
  },
  ...patch,
});

const auth: Auth = {
  user: { id: 'u1', username: 'stefano', displayName: 'Stefano', email: null, signIn: 'password' },
  setUser: () => {},
  signOut: async () => {},
  openSignIn: () => {},
};

let root: Root;
let host: HTMLElement;
const saved: Settings[] = [];

// Settings as the page holds them: what was saved last.
function Page({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  return createElement(ImageGenerationSection, {
    settings,
    onSave: (next: Settings) => {
      saved.push(next);
      setSettings(next);
    },
  });
}

async function open(provider: 'atelier' | 'openrouter', answer: ImageGenerationStatus) {
  vi.spyOn(api, 'imageGeneration').mockResolvedValue(answer);
  const initial = { ...defaultSettings(), imageGeneration: { model: 'nb' as const, count: 3 as const, provider } };
  await act(async () => {
    root.render(createElement(AuthContext.Provider, { value: auth }, createElement(Page, { initial })));
  });
}

const button = (name: string) =>
  [...host.querySelectorAll('button')].find((b) => b.querySelector('b')?.textContent === name || b.textContent === name)!;

beforeEach(() => {
  saved.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('choosing a provider', () => {
  it('saves it, keeps the defaults, marks it and toasts', async () => {
    await open('atelier', status());
    expect(button('Atelier').getAttribute('aria-pressed')).toBe('true');
    await act(async () => button('OpenRouter').click());
    expect(saved).toHaveLength(1);
    expect(saved[0]!.imageGeneration).toEqual({ model: 'nb', count: 3, provider: 'openrouter' });
    expect(button('OpenRouter').getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).toContain('Generate now goes through OpenRouter.');
  });

  it('does not save a click on the chosen one or on one that is off', async () => {
    await open('openrouter', status({ provider: 'openrouter', atelier: { available: false, url: null, token: null } }));
    await act(async () => button('OpenRouter').click());
    await act(async () => button('Atelier').click());
    expect(button('Atelier').disabled).toBe(true);
    expect(saved).toHaveLength(0);
  });

  it('shows the chosen provider’s estimates in the defaults', async () => {
    await open('atelier', status());
    expect(host.textContent).toContain('≈ $0.08 · ');
  });
});

describe('removing the Atelier token', () => {
  it('with Atelier chosen and an OpenRouter key: switches to OpenRouter', async () => {
    await open('atelier', status());
    const remove = vi.spyOn(api, 'removeAtelierToken').mockResolvedValue(undefined);
    await act(async () => button('Remove').click());
    expect(remove).toHaveBeenCalledOnce();
    expect(saved.at(-1)!.imageGeneration.provider).toBe('openrouter');
    expect(button('OpenRouter').getAttribute('aria-pressed')).toBe('true');
    expect(button('Atelier').disabled).toBe(true);
    expect(host.textContent).toContain('Add a token below');
    expect(host.querySelector('#atl-token')).not.toBeNull();
    expect(document.body.textContent).toContain('Token removed. Generate now goes through OpenRouter.');
  });

  it('without an OpenRouter key: Atelier stays chosen', async () => {
    await open('atelier', status({ key: null }));
    vi.spyOn(api, 'removeAtelierToken').mockResolvedValue(undefined);
    // The key card's own Remove is not there: the only Remove is the token's.
    await act(async () => button('Remove').click());
    expect(saved).toHaveLength(0);
    expect(button('Atelier').getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).toContain('Token removed.');
    expect(document.body.textContent).not.toContain('goes through OpenRouter');
  });

  it('with OpenRouter chosen: nothing switches', async () => {
    await open('openrouter', status({ provider: 'openrouter' }));
    vi.spyOn(api, 'removeAtelierToken').mockResolvedValue(undefined);
    await act(async () => button('Remove').click());
    expect(saved).toHaveLength(0);
    expect(document.body.textContent).not.toContain('goes through OpenRouter');
  });
});

describe('saving a token', () => {
  it('stores the answer and toasts the month', async () => {
    await open('openrouter', status({ provider: 'openrouter', atelier: { available: true, url: 'https://a', token: null } }));
    const save = vi.spyOn(api, 'saveAtelierToken').mockResolvedValue(status({ provider: 'openrouter' }));
    const input = host.querySelector<HTMLInputElement>('#atl-token')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, ' atl_pat_good ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Save and check').click());
    expect(save).toHaveBeenCalledWith('atl_pat_good');
    expect(host.textContent).toContain('atl_pat_••••••••••••7c1d');
    expect(button('Atelier').disabled).toBe(false);
    expect(document.body.textContent).toContain('Token saved and checked: write access, $0.90 of $20 used.');
  });
});
