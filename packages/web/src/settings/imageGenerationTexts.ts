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
