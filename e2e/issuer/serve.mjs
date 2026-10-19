// The test issuer of the server's tests (oidc-issuer.ts), served over https
// for the end-to-end tests and the owner's preview. It runs in a container of
// the app's image, which holds jose as a dependency of openid-client, with
// this file and the issuer mounted beside each other under /app/issuer; Node
// strips the issuer's types.
//
//   ISSUER_ORIGIN  the origin the app and the browser reach it at
//   ISSUER_PORT    the port to listen on, inside the container
//   ISSUER_CERTS   a folder with issuer.key and issuer.pem
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startIssuer } from './oidc-issuer.ts';

const certs = process.env.ISSUER_CERTS ?? '/certs';
const issuer = await startIssuer({
  tls: { key: readFileSync(join(certs, 'issuer.key')), cert: readFileSync(join(certs, 'issuer.pem')) },
  host: '0.0.0.0',
  port: Number(process.env.ISSUER_PORT ?? 9443),
  publicOrigin: process.env.ISSUER_ORIGIN,
  page: true,
});
console.log(`Test issuer at ${issuer.issuer}, client ${issuer.clientId}`);

const stop = () => issuer.close().then(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
