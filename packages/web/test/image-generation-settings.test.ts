import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type Settings } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import type { ImageGenerationStatus } from '../src/api.js';
import { DefaultsCard, KeyCard, OfflineCard, SpendingCard } from '../src/settings/ImageGeneration.js';
import { keyStatusLine, monthName, savedToast, saveError, UNREADABLE } from '../src/settings/imageGenerationTexts.js';

// Settings → Image generation (board-image-generation «The approved
// screens», screens 10 and 10b): the key card's states, the defaults, the
// spending.

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const spending = {
  month: { images: 3, cost: 0.12 },
  all: { images: 32, cost: 1.33 },
  projects: [
    { projectId: 'a', title: "L'Ancora di Sabaoth", images: 3, cost: 0.12 },
    { projectId: 'b', title: 'Il Faro di Capo Peloro', images: 0, cost: 0 },
    { projectId: null, title: null, images: 1, cost: 0.04 },
  ],
};

const status = (patch: Partial<ImageGenerationStatus> = {}): ImageGenerationStatus => ({
  configured: true,
  key: { hint: 'a41f', checkedAt: '2026-11-11T21:40:00.000Z', limitRemaining: 12.4 },
  spending,
  ...patch,
});

const key = (s: ImageGenerationStatus) =>
  renderToStaticMarkup(createElement(KeyCard, { status: s, onStatus: () => {}, onToast: () => {} }));

const clock = () => '21:40';

describe('the key', () => {
  it('saved: masked, Replace and Remove, and whether it works', () => {
    const html = key(status());
    expect(text(html)).toMatch(
      /^OpenRouter key Key sk-or-v1-••••••••••••a41f Replace Remove Works\. \$12\.40 credit left on this key \(checked \d\d:\d\d\)\. Stored encrypted on the server/,
    );
    expect(html).not.toMatch(/<input/);
  });

  it('says why a saved key does not work, or that it has no limit', () => {
    const saved = status().key!;
    expect(keyStatusLine(saved, undefined, clock)).toEqual({
      ok: true,
      text: 'Works. $12.40 credit left on this key (checked 21:40).',
    });
    expect(keyStatusLine({ ...saved, limitRemaining: null }, undefined, clock)).toEqual({
      ok: true,
      text: 'Works. No spending limit on this key.',
    });
    expect(keyStatusLine(saved, 'key_rejected', clock)).toEqual({ ok: false, text: 'OpenRouter rejects this key now. Replace it.' });
    expect(keyStatusLine({ ...saved, limitRemaining: null }, 'openrouter_unreachable', clock)).toEqual({
      ok: false,
      text: 'OpenRouter did not answer; last checked 21:40.',
    });
  });

  it('not saved: a password input with no autocomplete, Save and check, the hint', () => {
    const html = key(status({ key: null }));
    expect(html).toMatch(/<input id="or-key" type="password" placeholder="sk-or-v1-…" autoComplete="off" spellCheck="false"/);
    // Password managers are told to leave it alone, and no form submits it.
    expect(html).toMatch(/data-1p-ignore="" data-lpignore="true" data-bwignore="true" value=""\/>/);
    expect(html).not.toMatch(/<form/);
    expect(text(html)).toMatch(
      /^OpenRouter key Key Save and check Create one at openrouter\.ai\/settings\/keys\. A spending limit on the key caps what Promptbook can spend\. Stored encrypted/,
    );
    expect(text(html)).not.toMatch(/can't be read/);
  });

  it('unreadable: asks for it again', () => {
    expect(text(key(status({ key: null, error: 'key_unreadable' })))).toMatch(
      new RegExp(`^OpenRouter key ${UNREADABLE.replace(/\./g, '\\.')} Key`),
    );
  });

  it('tells its toasts and its save errors', () => {
    expect(savedToast(12.4)).toBe('Key saved and checked: $12.40 credit left.');
    expect(savedToast(null)).toBe('Key saved and checked: no spending limit.');
    expect(saveError('key_rejected', '')).toBe('OpenRouter rejected this key.');
    expect(saveError('openrouter_unreachable', '')).toBe('OpenRouter did not answer. Nothing was saved.');
    expect(saveError('validation_error', 'key: too long')).toBe('key: too long');
  });

  it('never shows the key, only its last four characters', () => {
    expect(key(status())).not.toMatch(/sk-or-v1-[a-z0-9]{8}/);
  });
});

describe('the defaults for Generate', () => {
  const card = (settings: Settings) => renderToStaticMarkup(createElement(DefaultsCard, { settings, onSave: () => {} }));

  it('shows the saved model and count', () => {
    const html = card({ ...defaultSettings(), imageGeneration: { model: 'nb', count: 3, provider: 'openrouter' } });
    expect(html).toMatch(/<button class="model on" aria-pressed="true"><b>Nano Banana 2\.1<\/b>/);
    expect(html).toMatch(/<button class="on" aria-pressed="true">3<\/button>/);
    expect(text(html)).toMatch(/Images per Generate 1 2 3 4 The Generate panel starts from these; your last choice there is kept for the session\.$/);
  });

  it('falls back to GPT and 2 for settings saved before this change', () => {
    const { imageGeneration: _, ...older } = defaultSettings();
    const html = card(older as Settings);
    expect(html).toMatch(/<button class="model on" aria-pressed="true"><b>GPT Image 2\.6<\/b>/);
    expect(html).toMatch(/<button class="on" aria-pressed="true">2<\/button>/);
  });
});

describe('the spending', () => {
  it('totals the month and all time, and the month by project', () => {
    const t = text(renderToStaticMarkup(createElement(SpendingCard, { spending })));
    const month = monthName(new Date());
    expect(t).toBe(
      `Spending $0.12 ${month}, 3 images $1.33 All time, 32 images Project Images ${month} ` +
        "L'Ancora di Sabaoth 3 $0.12 Il Faro di Capo Peloro 0 $0.00 Removed projects 1 $0.04 " +
        'Costs as OpenRouter reports them for each image. Removing an image does not remove its cost.',
    );
  });

  it('names the month in UTC', () => {
    expect(monthName(new Date('2026-11-30T23:30:00.000Z'), 'en')).toBe('November');
    expect(monthName(new Date('2026-12-01T00:30:00.000Z'), 'en')).toBe('December');
  });
});

describe('offline on the desktop', () => {
  it('keeps the section on the server', () => {
    expect(text(renderToStaticMarkup(createElement(OfflineCard)))).toBe(
      'Image generation is kept on the server. Connect this computer to change it.',
    );
  });
});
