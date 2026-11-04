import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '../src/modules/auth/password.ts';
import { accountUsername } from '../src/modules/auth/identity.ts';
import { backendDirectory, runWranglerJson } from './wrangler-runner.mjs';
import { bootstrapArgs, bootstrapSql } from './bootstrap-config.mjs';

async function hidden(question) {
  process.stdout.write(question);
  emitKeypressEvents(process.stdin);
  const previousRaw = Boolean(process.stdin.isRaw);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolvePassword, reject) => {
    let value = '';
    const finish = () => { process.stdin.removeListener('keypress', keypress); process.stdin.setRawMode(previousRaw); process.stdin.pause(); process.stdout.write('\n'); };
    const keypress = (text, key) => {
      if (key?.ctrl && key.name === 'c') { finish(); reject(new Error('Bootstrap cancelled.')); }
      else if (key?.name === 'return' || key?.name === 'enter') { finish(); resolvePassword(value); }
      else if (key?.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (text && !key?.ctrl && !key?.meta && value.length < 2048) value += text;
    };
    process.stdin.on('keypress', keypress);
  });
}

async function accountInput() {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    let username, displayName;
    try { username = await terminal.question('Username: '); displayName = await terminal.question('Display name: '); } finally { terminal.close(); }
    const password = await hidden('Password (8–25 characters, hidden): ');
    if (password !== await hidden('Confirm password (hidden): ')) throw new Error('Passwords do not match.');
    return { username, displayName, password };
  }
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (input.length > 4096) throw new Error('Bootstrap input is too large.');
  }
  try { return JSON.parse(input); } catch { throw new Error('Provide account JSON through stdin; never pass passwords as CLI arguments.'); }
}

let temporaryFile;
try {
  const args = bootstrapArgs(process.argv.slice(2));
  const account = await accountInput();
  if (!account || typeof account.username !== 'string' || typeof account.password !== 'string') throw new Error('Username and password are required.');
  const id = randomUUID();
  const sql = bootstrapSql({ id, username: accountUsername(account.username), displayName: account.displayName, passwordHash: await hashPassword(account.password), now: Date.now() });
  account.password = '';
  const directory = resolve(backendDirectory, '.wrangler/bootstrap');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const candidate = resolve(directory, `${id}.sql`);
  writeFileSync(candidate, sql, { mode: 0o600, flag: 'wx' });
  temporaryFile = candidate;
  const output = runWranglerJson([...args, '--file', temporaryFile]);
  if (!Array.isArray(output) || !output.some((result) => result.success && result.results?.some((row) => row.id === id))) throw new Error('No Admin was created. The database must be empty and must not have been bootstrapped before.');
  console.log('Initial Super Admin created in the selected local database. No password was printed or saved.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Bootstrap failed.');
  process.exitCode = 1;
} finally {
  if (temporaryFile) unlinkSync(temporaryFile);
}
