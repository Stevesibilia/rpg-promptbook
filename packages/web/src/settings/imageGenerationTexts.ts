import { PROVIDER_NAMES } from 'promptbook-project';
import type { ImageGenerationStatus } from '../api.js';
import { money2 } from '../board/generate.js';

// The texts of Settings → Image generation (board-image-generation «The
// approved screens», screens 10 and 10b), kept out of the component so they
// can be tested.

// A saved key that no longer decrypts (the server key was rotated), D1.
export const UNREADABLE = "The saved key can't be read any more. Save it again.";

type SavedKey = NonNullable<ImageGenerationStatus['key']>;

// The line under a saved key: works, with the credit left or no limit; or
// why it does not.
export function keyStatusLine(
  key: SavedKey,
  error: ImageGenerationStatus['error'],
  clock: (iso: string) => string,
): { ok: boolean; text: string } {
  if (error === 'key_rejected') return { ok: false, text: 'OpenRouter rejects this key now. Replace it.' };
  if (error === 'openrouter_unreachable') {
    return { ok: false, text: `OpenRouter did not answer; last checked ${clock(key.checkedAt)}.` };
  }
  if (key.limitRemaining === null) return { ok: true, text: 'Works. No spending limit on this key.' };
  return {
    ok: true,
    text: `Works. ${money2(key.limitRemaining)} credit left on this key (checked ${clock(key.checkedAt)}).`,
  };
}

export const savedToast = (limitRemaining: number | null): string =>
  limitRemaining === null
    ? 'Key saved and checked: no spending limit.'
    : `Key saved and checked: ${money2(limitRemaining)} credit left.`;

// Why a key was not saved, under the input.
export function saveError(code: string, message: string): string {
  if (code === 'key_rejected') return 'OpenRouter rejected this key.';
  if (code === 'openrouter_unreachable') return 'OpenRouter did not answer. Nothing was saved.';
  return message;
}

// «November»: spending's month is the calendar month in UTC.
export const monthName = (now: Date, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(now);

// --- Generate through and the Atelier card (atelier-image-provider D13) ------

type Provider = ImageGenerationStatus['provider'];
type SavedToken = NonNullable<ImageGenerationStatus['atelier']['token']>;

// A saved token that no longer decrypts (the server key was rotated).
export const TOKEN_UNREADABLE = "The saved token can't be read any more. Save it again.";

export const NO_ATELIER_ADDRESS = 'This Promptbook server has no Atelier address. Whoever runs it sets ATELIER_URL.';

export const providerNotes: Record<Provider, string> = {
  atelier: 'One monthly cap; images also in its gallery',
  openrouter: 'Your own key, billed to that account',
};

// A choice of «Generate through»: whether it can be chosen, and the line
// under its name. A credential the provider refused keeps it off.
export function providerChoice(status: ImageGenerationStatus, provider: Provider): { ready: boolean; text: string } {
  if (provider === 'openrouter') {
    if (!status.key) return { ready: false, text: 'Add a key below' };
    if (status.error === 'key_rejected') return { ready: false, text: 'Check the key below' };
    return { ready: true, text: 'Key works' };
  }
  const { available, token, error } = status.atelier;
  if (!available) return { ready: false, text: 'Not available on this server' };
  if (!token) return { ready: false, text: 'Add a token below' };
  if (error === 'token_rejected' || error === 'token_read_only') return { ready: false, text: 'Check the token below' };
  return { ready: true, text: 'Token works' };
}

export const chosenToast = (provider: Provider): string => `Generate now goes through ${PROVIDER_NAMES[provider]}.`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// «12 Nov 2027», on this computer's calendar.
export function dayMonthYear(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// «$20», «$20.50»: Atelier's cap, whole dollars without cents.
export const capMoney = (dollars: number): string =>
  Number.isInteger(dollars) ? `$${dollars}` : money2(dollars);

// The line under a saved token: works, with its name, expiry and the month
// against Atelier's cap; or why it does not.
export function tokenStatusLine(
  token: SavedToken,
  error: ImageGenerationStatus['atelier']['error'],
  clock: (iso: string) => string,
  now: Date = new Date(),
): { ok: boolean; text: string } {
  if (error === 'token_rejected') return { ok: false, text: 'Atelier rejects this token now. Replace it.' };
  if (error === 'token_read_only') {
    return { ok: false, text: 'This token is read only. Make one with Generate + read in Atelier.' };
  }
  if (error === 'atelier_unreachable') {
    return { ok: false, text: `Atelier did not answer; last checked ${clock(token.checkedAt)}.` };
  }
  const head =
    token.name === null
      ? 'Works.'
      : `Works. Write token «${token.name}», ${token.expiresAt ? `expires ${dayMonthYear(token.expiresAt)}` : 'never expires'}.`;
  const tail = token.month
    ? ` ${money2(token.month.spent)} of the ${capMoney(token.month.cap)} cap used in ${monthName(now)} (checked ${clock(token.checkedAt)}).`
    : ` Checked ${clock(token.checkedAt)}.`;
  return { ok: true, text: head + tail };
}

export const tokenSavedToast = (token: SavedToken | null): string =>
  token?.month
    ? `Token saved and checked: write access, ${money2(token.month.spent)} of ${capMoney(token.month.cap)} used.`
    : 'Token saved and checked: write access.';

// Why a token was not saved, under the input: the server's sentences (D8).
export function tokenSaveError(code: string, message: string): string {
  switch (code) {
    case 'invalid':
      return 'This is not an Atelier API token.';
    case 'token_rejected':
      return 'Atelier rejected this token.';
    case 'token_read_only':
      return 'This token is read only. Make one with Generate + read in Atelier.';
    case 'atelier_unreachable':
      return 'Atelier did not answer. Nothing was saved.';
    case 'atelier_unavailable':
      return 'This server has no Atelier address.';
    default:
      return message;
  }
}

// After Remove: the toast, and whether D5 switched the choice to OpenRouter.
export const tokenRemovedToast = (switched: boolean): string =>
  switched ? 'Token removed. Generate now goes through OpenRouter.' : 'Token removed.';
