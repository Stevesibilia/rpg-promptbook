import { rmSync } from 'node:fs';
import { compose, issuerCerts } from './stack.js';

export default function teardown() {
  if (process.env.KEEP_STACK) return;
  compose('down', '-v');
  rmSync(issuerCerts, { recursive: true, force: true });
}
