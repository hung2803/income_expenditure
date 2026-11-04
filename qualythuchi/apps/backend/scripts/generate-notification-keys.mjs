import { randomBytes, webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';

const writeLocal = process.argv.includes('--write-local');
const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
if (!jwk.d || !jwk.x || !jwk.y) throw new Error('WebCrypto did not export the expected P-256 key material.');
const b64url = (value) => Buffer.from(value).toString('base64url');
const publicKey = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
const values = {
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: jwk.d,
  SUBSCRIPTION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
  VAPID_SUBJECT: 'mailto:admin@example.com'
};
if (writeLocal) {
  await writeFile(new URL('../.dev.vars.dev', import.meta.url), Object.entries(values).map(([key, value]) => `${key}="${value}"`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Created apps/backend/.dev.vars.dev with local-only notification keys. Secret values were not printed.');
} else {
  console.log(JSON.stringify(values, null, 2));
  console.error('Keep VAPID_PRIVATE_KEY and SUBSCRIPTION_ENCRYPTION_KEY secret. Generate separate values for dev, test, and prod.');
}
