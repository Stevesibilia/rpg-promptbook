import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Sha256, sha256Hex } from '../src/index.js';

const node = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const text = (s: string) => new TextEncoder().encode(s);

describe('sha256', () => {
  it('gives the standard test vectors', () => {
    expect(sha256Hex(text(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(text('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('agrees with node:crypto at every length around the block edges', () => {
    const bytes = randomBytes(300);
    for (let n = 0; n <= 300; n++) expect(sha256Hex(bytes.subarray(0, n)), `${n} bytes`).toBe(node(bytes.subarray(0, n)));
  });

  it('gives the same digest fed in uneven chunks', () => {
    const bytes = randomBytes(1_000_003);
    const hash = new Sha256();
    for (let at = 0, size = 1; at < bytes.length; at += size, size = (size * 7 + 3) % 70_000) {
      hash.update(bytes.subarray(at, at + size));
    }
    expect(hash.digestHex()).toBe(node(bytes));
  });

  it('refuses to go on after the digest', () => {
    const hash = new Sha256().update(text('abc'));
    hash.digestHex();
    expect(() => hash.update(text('d'))).toThrow();
    expect(() => hash.digestHex()).toThrow();
  });
});
