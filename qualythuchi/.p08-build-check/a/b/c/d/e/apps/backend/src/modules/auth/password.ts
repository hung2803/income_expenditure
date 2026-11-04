import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

// OWASP scrypt profile: N=2^14, r=8, p=5 (~16 MiB). Native Workers crypto;
// keep this identical in the offline bootstrap CLI and the Worker.
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
const COST = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const PREFIX = 'scrypt$v1$16384$8$5';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, COST, (error, key) => { if (error) reject(error); else resolve(key); });
  });
}

export function validateNewPassword(password: string): void {
  const length = Array.from(password).length;
  if (length < 8 || length > 25) {
    throw new Error('Use a password of 8–25 characters.');
  }
}

export async function hashPassword(password: string): Promise<string> {
  validateNewPassword(password);
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${PREFIX}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  // Fixed accepted parameters prevent a damaged/hostile database record from
  // selecting unbounded costs. Unknown users still perform the same KDF work.
  const parts = encoded?.split('$');
  const valid = Boolean(parts && parts.length === 7 && parts.slice(0, 5).join('$') === PREFIX && /^[a-f0-9]{32}$/.test(parts[5]) && /^[a-f0-9]{64}$/.test(parts[6]));
  const salt = Buffer.from(valid ? parts![5] : '00000000000000000000000000000000', 'hex');
  const expected = Buffer.from(valid ? parts![6] : '00'.repeat(32), 'hex');
  const key = await derive(password, salt);
  return timingSafeEqual(key, expected) && valid;
}
