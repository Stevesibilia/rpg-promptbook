import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A throwaway CA and the test issuer's certificate, signed by it, with
// openssl. The app trusts ca.pem through NODE_EXTRA_CA_CERTS; the browser
// is told to accept the issuer's pages. The files are readable by everyone:
// the containers run as another user, and nothing here is a secret.
export function makeCerts(dir: string, altNames: string[]): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const openssl = (...args: string[]) =>
    execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  openssl(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '7',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
    '-subj',
    '/CN=Promptbook test CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
  );
  openssl(
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'issuer.key',
    '-out',
    'issuer.csr',
    '-subj',
    '/CN=Promptbook test issuer',
  );
  writeFileSync(
    join(dir, 'issuer.ext'),
    `subjectAltName=${altNames.join(',')}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`,
  );
  openssl(
    'x509',
    '-req',
    '-in',
    'issuer.csr',
    '-CA',
    'ca.pem',
    '-CAkey',
    'ca.key',
    '-CAcreateserial',
    '-days',
    '7',
    '-out',
    'issuer.pem',
    '-extfile',
    'issuer.ext',
  );
  chmodSync(dir, 0o755);
  for (const file of ['ca.pem', 'issuer.key', 'issuer.pem']) chmodSync(join(dir, file), 0o644);
}
