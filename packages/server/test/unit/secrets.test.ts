import { describe, expect, it } from 'vitest';
import { keyHint, openSecret, sealSecret } from '../../src/images/secrets.js';

const SERVER_KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 8);
const STEVE = '00000000-0000-4000-8000-00000000000a';
const ANNA = '00000000-0000-4000-8000-00000000000b';
const PLAIN = 'sk-or-v1-0123456789abcdef0123456789abcdefa41f';

describe('sealed secrets (board-image-generation D1)', () => {
  it('opens what it sealed, and never holds the plain text', () => {
    const sealed = sealSecret(SERVER_KEY, STEVE, 'openrouter', PLAIN);
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
    expect(sealed.ciphertext.toString('utf8')).not.toContain('sk-or');
    expect(openSecret(SERVER_KEY, STEVE, 'openrouter', sealed)).toBe(PLAIN);
  });

  it('takes a new IV each time', () => {
    const a = sealSecret(SERVER_KEY, STEVE, 'openrouter', PLAIN);
    const b = sealSecret(SERVER_KEY, STEVE, 'openrouter', PLAIN);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('opens nothing under another server key', () => {
    const sealed = sealSecret(SERVER_KEY, STEVE, 'openrouter', PLAIN);
    expect(openSecret(OTHER_KEY, STEVE, 'openrouter', sealed)).toBeNull();
  });

  it('opens nothing as another account’s row', () => {
    const sealed = sealSecret(SERVER_KEY, STEVE, 'openrouter', PLAIN);
    expect(openSecret(SERVER_KEY, ANNA, 'openrouter', sealed)).toBeNull();
  });

  it('opens nothing changed', () => {
    const sealed = sealSecret(SERVER_KEY, STEVE, 'openrouter', PLAIN);
    const flipped = Buffer.from(sealed.ciphertext);
    flipped[0] = flipped[0]! ^ 1;
    expect(openSecret(SERVER_KEY, STEVE, 'openrouter', { ...sealed, ciphertext: flipped })).toBeNull();
    expect(openSecret(SERVER_KEY, STEVE, 'openrouter', { ...sealed, tag: Buffer.alloc(16) })).toBeNull();
    expect(openSecret(SERVER_KEY, STEVE, 'openrouter', { ...sealed, tag: sealed.tag.subarray(0, 8) })).toBeNull();
    expect(openSecret(SERVER_KEY, STEVE, 'openrouter', { ...sealed, iv: Buffer.alloc(0) })).toBeNull();
  });

  it('hints with the last four characters', () => {
    expect(keyHint(PLAIN)).toBe('a41f');
  });
});
