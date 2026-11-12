import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type Settings } from 'promptbook-project';
import { describe, expect, it } from 'vitest';
import type { ImageGenerationStatus } from '../src/api.js';
import {
  AtelierCard,
  DefaultsCard,
  KeyCard,
  OfflineCard,
  ProviderCard,
  SpendingCard,
} from '../src/settings/ImageGeneration.js';
import {
  capMoney,
  chosenToast,
  dayMonthYear,
  keyStatusLine,
  monthName,
  providerChoice,
  savedToast,
  saveError,
  TOKEN_UNREADABLE,
  tokenRemovedToast,
  tokenSaveError,
  tokenSavedToast,
  tokenStatusLine,
  UNREADABLE,
} from '../src/settings/imageGenerationTexts.js';

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
    { projectId: 'a', title: "L'Ancora di Sabaoth", images: 3, cost: 0.12, atelier: 0.08, openrouter: 0.04 },
    { projectId: 'b', title: 'Il Faro di Capo Peloro', images: 0, cost: 0, atelier: 0, openrouter: 0 },
    { projectId: null, title: null, images: 1, cost: 0.04, atelier: 0, openrouter: 0.04 },
  ],
};

const status = (patch: Partial<ImageGenerationStatus> = {}): ImageGenerationStatus => ({
  configured: true,
  key: { hint: 'a41f', checkedAt: '2026-11-11T21:40:00.000Z', limitRemaining: 12.4 },
  spending,
  provider: 'openrouter',
  atelier: { available: true, url: 'https://atelier.siberio.eu', token: null },
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
      `Spending $0.12 ${month}, 3 images $1.33 All time, 32 images Project Images Atelier OpenRouter ${month} ` +
        "L'Ancora di Sabaoth 3 $0.08 $0.04 $0.12 Il Faro di Capo Peloro 0 $0.00 $0.00 $0.00 Removed projects 1 $0.00 $0.04 $0.04 " +
        "Costs as Atelier or OpenRouter report them for each image. Atelier's cap also counts what you make in Atelier itself. " +
        'Removing an image does not remove its cost.',
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

// atelier-image-provider D13, mockup screens 1, 1b, 1c and 1d.

const token = {
  hint: '7c1d',
  checkedAt: '2026-11-12T21:40:00.000Z',
  name: 'promptbook',
  expiresAt: '2027-11-12T12:00:00.000Z',
  month: { spent: 0.9, cap: 20 },
  estimates: { gpt: 0.083, nb: 0.037 },
};

// Screen 1: both set up, Atelier chosen.
const both = (patch: Partial<ImageGenerationStatus> = {}) =>
  status({ provider: 'atelier', atelier: { available: true, url: 'https://atelier.siberio.eu', token }, ...patch });
// Screen 1b: no Atelier token, OpenRouter chosen.
const noToken = () => status({ atelier: { available: true, url: 'https://atelier.siberio.eu', token: null } });
// Screen 1c: the server has no Atelier address.
const noServer = () => status({ atelier: { available: false, url: null, token: null } });

const through = (s: ImageGenerationStatus, chosen = s.provider) =>
  renderToStaticMarkup(createElement(ProviderCard, { status: s, chosen, onChoose: () => {} }));
const atelier = (s: ImageGenerationStatus) =>
  renderToStaticMarkup(
    createElement(AtelierCard, { status: s, onStatus: () => {}, onToast: () => {}, onRemoved: () => {} }),
  );
const now = new Date('2026-11-12T22:00:00.000Z');

describe('Generate through', () => {
  const hint = 'Generate uses this one for every project. Images already generated keep where they came from.';

  it('screen 1: both work, Atelier chosen', () => {
    const html = through(both());
    expect(text(html)).toBe(
      'Generate through Atelier One monthly cap; images also in its gallery Token works ' +
        `OpenRouter Your own key, billed to that account Key works ${hint}`,
    );
    expect(html).toMatch(/<button class="model on" aria-pressed="true"><b>Atelier<\/b>/);
    expect(html).toMatch(/<button class="model" aria-pressed="false"><b>OpenRouter<\/b>/);
    expect(html).not.toMatch(/disabled/);
    expect(html).toMatch(/<span class="ok">Token works<\/span>/);
  });

  it('screen 1b: no token, Atelier off with «Add a token below»', () => {
    const html = through(noToken());
    expect(html).toMatch(/<button class="model" aria-pressed="false" disabled=""><b>Atelier<\/b>.*<span class="no">Add a token below<\/span>/);
    expect(html).toMatch(/<button class="model on" aria-pressed="true"><b>OpenRouter<\/b>/);
  });

  it('screen 1c: no Atelier on the server', () => {
    expect(through(noServer())).toMatch(/disabled=""><b>Atelier<\/b>.*<span class="no">Not available on this server<\/span>/);
  });

  it('screen 1d: OpenRouter chosen with both set up', () => {
    const html = through(both({ provider: 'openrouter' }));
    expect(html).toMatch(/<button class="model" aria-pressed="false"><b>Atelier<\/b>/);
    expect(html).toMatch(/<button class="model on" aria-pressed="true"><b>OpenRouter<\/b>/);
  });

  it('no key: OpenRouter off; a refused credential keeps its choice off', () => {
    expect(providerChoice(status({ key: null }), 'openrouter')).toEqual({ ready: false, text: 'Add a key below' });
    expect(providerChoice(status({ error: 'key_rejected' }), 'openrouter')).toEqual({ ready: false, text: 'Check the key below' });
    const rejected = both({ atelier: { available: true, url: 'x', token, error: 'token_rejected' } });
    expect(providerChoice(rejected, 'atelier')).toEqual({ ready: false, text: 'Check the token below' });
    const unreachable = both({ atelier: { available: true, url: 'x', token, error: 'atelier_unreachable' } });
    expect(providerChoice(unreachable, 'atelier')).toEqual({ ready: true, text: 'Token works' });
  });

  it('cannot be chosen before the settings are loaded', () => {
    const html = renderToStaticMarkup(createElement(ProviderCard, { status: both(), chosen: 'atelier', onChoose: null }));
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('toasts the choice', () => {
    expect(chosenToast('atelier')).toBe('Generate now goes through Atelier.');
    expect(chosenToast('openrouter')).toBe('Generate now goes through OpenRouter.');
  });
});

describe('the Atelier card', () => {
  const footnote =
    'Stored encrypted on the server, like the OpenRouter key. Images also go into an Atelier collection named after the project, made on the first Generate.';

  it('screen 1: the address, the masked token and what it is', () => {
    const html = atelier(both());
    expect(text(html)).toMatch(
      new RegExp(
        '^Atelier Address https://atelier\\.siberio\\.eu Set by the server\\. API token atl_pat_••••••••••••7c1d Replace Remove ' +
          'Works\\. Write token «promptbook», expires 12 Nov 2027\\. \\$0\\.90 of the \\$20 cap used in \\w+ \\(checked \\d\\d:\\d\\d\\)\\. ',
      ),
    );
    expect(text(html).endsWith(footnote)).toBe(true);
    expect(html).toMatch(/<span class="srv">https:\/\/atelier\.siberio\.eu<\/span>/);
    expect(html).not.toMatch(/<input/);
  });

  it('screen 1b: the token input', () => {
    const html = atelier(noToken());
    expect(html).toMatch(/<input id="atl-token" type="password" placeholder="atl_pat_…" autoComplete="off" spellCheck="false"/);
    expect(html).toMatch(/data-1p-ignore="" data-lpignore="true" data-bwignore="true" value=""\/>/);
    expect(html).not.toMatch(/<form/);
    expect(text(html)).toBe(
      'Atelier Address https://atelier.siberio.eu Set by the server. API token Save and check ' +
        `Make a token with write access in Atelier → Settings → API tokens. ${footnote}`,
    );
  });

  it('screen 1c: the server has no address', () => {
    expect(text(atelier(noServer()))).toBe(
      'Atelier This Promptbook server has no Atelier address. Whoever runs it sets ATELIER_URL .',
    );
    expect(atelier(noServer())).toMatch(/<code>ATELIER_URL<\/code>/);
  });

  it('unreadable: asks for it again', () => {
    const html = atelier(both({ atelier: { available: true, url: 'u', token: null, error: 'token_unreadable' } }));
    expect(text(html)).toMatch(new RegExp(`^Atelier Address u Set by the server\\. ${TOKEN_UNREADABLE.replace(/\./g, '\\.')} API token`));
  });

  it('says why a saved token does not work', () => {
    const clock = () => '21:40';
    expect(tokenStatusLine(token, 'token_rejected', clock)).toEqual({ ok: false, text: 'Atelier rejects this token now. Replace it.' });
    expect(tokenStatusLine(token, 'token_read_only', clock)).toEqual({
      ok: false,
      text: 'This token is read only. Make one with Generate + read in Atelier.',
    });
    expect(tokenStatusLine(token, 'atelier_unreachable', clock)).toEqual({
      ok: false,
      text: 'Atelier did not answer; last checked 21:40.',
    });
  });

  it('works: never expires, or the details not checked', () => {
    const clock = () => '21:40';
    expect(tokenStatusLine(token, undefined, clock, now).text).toBe(
      'Works. Write token «promptbook», expires 12 Nov 2027. $0.90 of the $20 cap used in November (checked 21:40).',
    );
    expect(tokenStatusLine({ ...token, expiresAt: null, month: { spent: 4.125, cap: 20.5 } }, undefined, clock, now).text).toBe(
      'Works. Write token «promptbook», never expires. $4.13 of the $20.50 cap used in November (checked 21:40).',
    );
    expect(tokenStatusLine({ ...token, name: null, expiresAt: null, month: null }, undefined, clock).text).toBe(
      'Works. Checked 21:40.',
    );
  });

  it('tells its toasts and its save errors', () => {
    expect(tokenSavedToast(token)).toBe('Token saved and checked: write access, $0.90 of $20 used.');
    expect(tokenSavedToast({ ...token, month: null })).toBe('Token saved and checked: write access.');
    expect(tokenSaveError('invalid', '')).toBe('This is not an Atelier API token.');
    expect(tokenSaveError('token_rejected', '')).toBe('Atelier rejected this token.');
    expect(tokenSaveError('token_read_only', '')).toBe('This token is read only. Make one with Generate + read in Atelier.');
    expect(tokenSaveError('atelier_unreachable', '')).toBe('Atelier did not answer. Nothing was saved.');
    expect(tokenSaveError('atelier_unavailable', '')).toBe('This server has no Atelier address.');
    expect(tokenSaveError('validation_error', 'token: too long')).toBe('token: too long');
    expect(tokenRemovedToast(true)).toBe('Token removed. Generate now goes through OpenRouter.');
    expect(tokenRemovedToast(false)).toBe('Token removed.');
  });

  it('writes dates and the cap as the mockup does', () => {
    expect(dayMonthYear('2027-09-03T12:00:00.000Z')).toBe('3 Sep 2027');
    expect(capMoney(20)).toBe('$20');
    expect(capMoney(20.5)).toBe('$20.50');
  });

  it('never shows the token, only its last four characters', () => {
    expect(atelier(both())).not.toMatch(/atl_pat_[a-z0-9]{8}/);
  });
});

describe('the defaults use the chosen provider’s estimates', () => {
  it('Atelier’s, where it gave them', () => {
    const html = renderToStaticMarkup(
      createElement(DefaultsCard, { settings: defaultSettings(), onSave: () => {}, estimates: { gpt: 0.083 } }),
    );
    expect(text(html)).toMatch(/GPT Image 2\.6 Best detail and text ≈ \$0\.08 · \d+ s per image Nano Banana 2\.1 Fast draft ≈ \$0\.04/);
  });
});
