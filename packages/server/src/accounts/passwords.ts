import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { AppError } from '../errors.js';

// OWASP's baseline Argon2id parameters: 19 MiB, two passes, one lane. Stated
// here because changing them is a security decision. The encoded hash carries
// its own parameters, so old hashes keep verifying after a change.
const OPTIONS = {
  // Algorithm.Argon2id: a const enum, which verbatimModuleSyntax cannot read.
  algorithm: 2 as Algorithm,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const MIN_PASSWORD_LENGTH = 12;
// Far above any real password; bounds the work one request can ask for.
const MAX_PASSWORD_LENGTH = 1024;

// A hash of a password nobody uses, verified for an unknown username so the
// answer takes as long as for a wrong password.
let dummyHash: Promise<string> | null = null;

export function assertPasswordAcceptable(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, 'weak_password', `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(400, 'weak_password', `The password can have at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordAcceptable(password);
  return hash(password, OPTIONS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    // A malformed hash is not a success.
    return false;
  }
}

export async function burnVerificationTime(password: string): Promise<false> {
  dummyHash ??= hash('promptbook-nonexistent-account-placeholder', OPTIONS);
  await verifyPassword(await dummyHash, password.slice(0, MAX_PASSWORD_LENGTH));
  return false;
}
