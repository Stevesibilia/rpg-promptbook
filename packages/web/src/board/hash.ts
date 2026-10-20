import { sha256Hex } from 'promptbook-project';

// A file's SHA-256 as lower-case hex (asset-board design decision 9): Web
// Crypto where the page has it, the project package's own SHA-256 outside a
// secure context (a LAN preview over plain HTTP), where crypto.subtle is
// missing.
export async function hashBytes(
  bytes: Uint8Array,
  subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
): Promise<string> {
  if (!subtle) return sha256Hex(bytes);
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
