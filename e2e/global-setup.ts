import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeCerts } from './issuer/certs.js';
import { compose, issuerCerts, issuerHost, username } from './stack.js';

// Builds and starts the stack, then fills the account with the sample
// projects. With KEEP_STACK=1 a stack left from an earlier run is reused and
// keeps its data, and its issuer keeps the certificates it started with.
export default function setup() {
  if (!process.env.KEEP_STACK || !existsSync(join(issuerCerts, 'issuer.pem'))) {
    makeCerts(issuerCerts, [`DNS:${issuerHost}`, 'IP:127.0.0.1']);
  }
  compose('up', '-d', '--build', '--wait');
  try {
    compose('exec', '-T', 'app', 'node', 'dist/cli.js', 'seed', username);
  } catch (error) {
    if (!process.env.KEEP_STACK) throw error;
  }
}
