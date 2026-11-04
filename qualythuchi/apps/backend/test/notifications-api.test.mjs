import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash, webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { sqliteD1 } from './sqlite-d1.mjs';
import { app } from '../src/app.ts';
import { csrfForSession, hashToken } from '../src/modules/auth/tokens.ts';
import { reminderLocalDate } from '../src/modules/notifications/time.ts';
import { runNotificationSchedule } from '../src/modules/notifications/scheduler.ts';
import { decryptSubscription } from '../src/modules/notifications/routes.ts';
import { buildPushPayload } from '@block65/webcrypto-web-push';

const ORIGIN = 'https://app.example.test';

function fixture() {
  const database = sqliteD1();
  const now = Date.now();
  const insertUser = database.sql.prepare(`INSERT INTO users(id,username,display_name,role,password_hash,created_at,updated_at) VALUES(?,?,?,'USER','test-hash',?,?)`);
  for (const id of ['user-a', 'user-b']) insertUser.run(id, id, id, now, now);
  const sessions = new Map();
  for (const userId of ['user-a', 'user-b']) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    database.sql.prepare('INSERT INTO sessions(token_hash,user_id,auth_version,created_at,expires_at) VALUES(?,?,1,?,?)')
      .run(tokenHash, userId, now, now + 86_400_000);
    sessions.set(userId, { token, csrf: csrfForSession(token) });
  }
  const env = { DB: database.db, APP_ENV: 'prod', CORS_ORIGINS: ORIGIN, SUBSCRIPTION_ENCRYPTION_KEY: randomBytes(32).toString('base64url'), VAPID_PUBLIC_KEY: 'public' };
  return { ...database, env, sessions };
}

async function request(f, userId, path, { method = 'GET', body, csrf = false } = {}) {
  const credentials = f.sessions.get(userId);
  return app.fetch(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: ORIGIN, Cookie: `__Host-thu_chi_session=${credentials.token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(csrf ? { 'X-CSRF-Token': credentials.csrf } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), f.env);
}

const base64url = (value) => Buffer.from(value).toString('base64url');

async function registerPushDevice(f, userId, suffix = userId) {
  const vapid = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const vapidJwk = await webcrypto.subtle.exportKey('jwk', vapid.privateKey);
  f.env.VAPID_PUBLIC_KEY = base64url(Buffer.concat([
    Buffer.from([4]), Buffer.from(vapidJwk.x, 'base64url'), Buffer.from(vapidJwk.y, 'base64url')
  ]));
  f.env.VAPID_PRIVATE_KEY = vapidJwk.d;
  f.env.VAPID_SUBJECT = 'mailto:test@example.com';

  const clientKey = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = base64url(await webcrypto.subtle.exportKey('raw', clientKey.publicKey));
  const endpoint = `https://fcm.googleapis.com/fcm/send/${suffix}`;
  const response = await request(f, userId, `/api/users/${userId}/notifications/subscriptions`, {
    method: 'POST', csrf: true,
    body: {
      subscription: { endpoint, expirationTime: null, keys: { p256dh, auth: randomBytes(16).toString('base64url') } },
      timezone: 'Asia/Bangkok'
    }
  });
  assert.equal(response.status, 201);
  return endpoint;
}

test('notification inbox, read state, and settings are scoped to the authenticated owner', async () => {
  const f = fixture();
  try {
    const now = Date.now();
    f.sql.prepare(`INSERT INTO notifications(id,owner_user_id,kind,dedupe_key,title,body,created_at) VALUES('only-a','user-a','DAILY_REMINDER','daily:test','Reminder','Open the app',?)`).run(now);
    let response = await request(f, 'user-b', '/api/users/user-a/notifications');
    assert.equal(response.status, 403);
    response = await request(f, 'user-a', '/api/users/user-a/notifications');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).notifications[0].id, 'only-a');
    response = await request(f, 'user-b', '/api/users/user-a/notifications/only-a/read', { method: 'POST', body: {}, csrf: true });
    assert.equal(response.status, 403);
    response = await request(f, 'user-a', '/api/users/user-a/notifications/only-a/read', { method: 'POST', body: {}, csrf: true });
    assert.equal(response.status, 200);
    assert.ok(f.sql.prepare("SELECT read_at FROM notifications WHERE id='only-a'").get().read_at);
    response = await request(f, 'user-a', '/api/users/user-a/notifications/settings', { method: 'PUT', body: { timezone: 'Invalid/Zone', pushEnabled: true }, csrf: true });
    assert.equal(response.status, 400);
  } finally { f.close(); }
});

test('push subscriptions are encrypted, endpoint-hashed, scoped, and provider-validated', async () => {
  const f = fixture();
  try {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test-token';
    const subscription = { endpoint, expirationTime: null, keys: { p256dh: Buffer.alloc(65, 1).toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') } };
    let response = await request(f, 'user-b', '/api/users/user-a/notifications/subscriptions', { method: 'POST', body: { subscription, timezone: 'Asia/Bangkok' }, csrf: true });
    assert.equal(response.status, 403);
    response = await request(f, 'user-a', '/api/users/user-a/notifications/subscriptions', { method: 'POST', body: { subscription: { ...subscription, endpoint: 'http://127.0.0.1/private' }, timezone: 'Asia/Bangkok' }, csrf: true });
    assert.equal(response.status, 400);
    response = await request(f, 'user-a', '/api/users/user-a/notifications/subscriptions', { method: 'POST', body: { subscription, timezone: 'Asia/Bangkok' }, csrf: true });
    assert.equal(response.status, 201);
    const row = f.sql.prepare("SELECT * FROM push_subscriptions WHERE owner_user_id='user-a'").get();
    assert.notEqual(row.endpoint_hash, endpoint);
    assert.ok(!row.subscription_ciphertext.includes(endpoint));
    const duplicate = await request(f, 'user-a', '/api/users/user-a/notifications/subscriptions', { method: 'POST', body: { subscription, timezone: 'Asia/Bangkok' }, csrf: true });
    assert.equal(duplicate.status, 201);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE owner_user_id='user-a'").get().count, 1);
    const endpointHash = createHash('sha256').update(endpoint).digest('base64url');
    assert.equal(row.endpoint_hash, endpointHash);
  } finally { f.close(); }
});

test('budget milestones create one in-app alert per owner, budget, period, and milestone', () => {
  const f = fixture();
  try {
    const now = Date.now();
    f.sql.prepare(`INSERT INTO budgets(id,owner_user_id,category_id,period,amount,scope_key,created_at,updated_at)
      VALUES('budget-a','user-a',NULL,'2099-01',100,'',?,?)`).run(now, now);
    f.sql.prepare(`INSERT INTO budget_threshold_events(id,owner_user_id,budget_id,period,milestone,spent_amount,budget_amount,created_at)
      VALUES('event-a','user-a','budget-a','2099-01',80,80,100,?)`).run(now);
    const alert = f.sql.prepare("SELECT * FROM notifications WHERE owner_user_id='user-a'").get();
    assert.equal(alert.kind, 'BUDGET_THRESHOLD');
    assert.equal(alert.dedupe_key, 'budget:budget-a:2099-01:80');
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id='user-b'").get().count, 0);
    assert.throws(() => f.sql.prepare(`INSERT INTO budget_threshold_events(id,owner_user_id,budget_id,period,milestone,spent_amount,budget_amount,created_at)
      VALUES('event-duplicate','user-a','budget-a','2099-01',80,80,100,?)`).run(now));
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id='user-a'").get().count, 1);
  } finally { f.close(); }
});

test('daily reminder scheduling uses each owner timezone and dedupes on the local calendar date', () => {
  const at = new Date('2026-10-23T14:00:00.000Z');
  assert.equal(reminderLocalDate(at, 'Asia/Bangkok'), '2026-10-23');
  assert.equal(reminderLocalDate(at, 'America/Los_Angeles'), null);
  assert.throws(() => reminderLocalDate(at, 'Invalid/Zone'));
  const f = fixture();
  try {
    for (const id of ['reminder-1', 'reminder-2']) f.sql.prepare(`INSERT OR IGNORE INTO notifications
      (id,owner_user_id,kind,dedupe_key,title,body,created_at) VALUES(?,'user-a','DAILY_REMINDER','daily:2026-10-23','Reminder','Open the app',?)`).run(id, at.getTime());
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id='user-a' AND dedupe_key='daily:2026-10-23'").get().count, 1);
  } finally { f.close(); }
});

test('scheduled reminders send once per owner and local date, then stop retrying after three provider failures', async () => {
  const f = fixture();
  const originalFetch = globalThis.fetch;
  const sent = [];
  try {
    await registerPushDevice(f, 'user-a');
    await registerPushDevice(f, 'user-b');
    globalThis.fetch = async (url, init) => {
      sent.push({ url: String(url), init });
      return new Response(null, { status: 201 });
    };
    const storedSubscription = f.sql.prepare("SELECT subscription_ciphertext FROM push_subscriptions WHERE owner_user_id='user-a'").get();
    const decryptedSubscription = await decryptSubscription(storedSubscription.subscription_ciphertext, f.env);
    await buildPushPayload({ data: { title: 'Test', body: 'Test', url: '/notifications' }, options: { ttl: 3600, urgency: 'normal' } },
      decryptedSubscription, { publicKey: f.env.VAPID_PUBLIC_KEY, privateKey: f.env.VAPID_PRIVATE_KEY, subject: f.env.VAPID_SUBJECT });
    const atNinePm = new Date('2026-10-23T14:00:00.000Z');
    await runNotificationSchedule(f.env, atNinePm);
    await runNotificationSchedule(f.env, atNinePm);
    assert.equal(sent.length, 2, JSON.stringify({ deliveries: f.sql.prepare('SELECT status,attempts FROM notification_deliveries').all(), subscriptionCount: f.sql.prepare('SELECT COUNT(*) AS count FROM push_subscriptions WHERE disabled_at IS NULL').get().count }));
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM notifications WHERE kind=\'DAILY_REMINDER\'').get().count, 2);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notification_deliveries WHERE status='SENT' AND attempts=1").get().count, 2);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id='user-a' AND dedupe_key='daily:2026-10-23'").get().count, 1);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id='user-b' AND dedupe_key='daily:2026-10-23'").get().count, 1);

    globalThis.fetch = async () => {
      sent.push({ failed: true });
      return new Response(null, { status: 503 });
    };
    const retryStart = new Date('2026-10-24T14:00:00.000Z');
    await runNotificationSchedule(f.env, retryStart);
    await runNotificationSchedule(f.env, new Date(retryStart.getTime() + 5 * 60_000));
    await runNotificationSchedule(f.env, new Date(retryStart.getTime() + 10 * 60_000));
    const sendCountAtLimit = sent.length;
    await runNotificationSchedule(f.env, new Date(retryStart.getTime() + 15 * 60_000));
    assert.equal(sent.length, sendCountAtLimit);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notification_deliveries WHERE status='FAILED' AND attempts=3").get().count, 2);
  } finally {
    globalThis.fetch = originalFetch;
    f.close();
  }
});

test('expired push endpoints are disabled and owner delivery state is marked failed', async () => {
  const f = fixture();
  const originalFetch = globalThis.fetch;
  try {
    const endpoint = await registerPushDevice(f, 'user-a', 'expired-device');
    globalThis.fetch = async () => new Response(null, { status: 410 });
    await runNotificationSchedule(f.env, new Date('2026-10-23T14:00:00.000Z'));
    const subscription = f.sql.prepare('SELECT disabled_at FROM push_subscriptions WHERE owner_user_id=\'user-a\'').get();
    assert.ok(subscription.disabled_at);
    assert.equal(f.sql.prepare("SELECT status FROM notification_deliveries WHERE status='FAILED'").get().status, 'FAILED');
    const userBNotifications = f.sql.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id='user-b'").get().count;
    assert.equal(userBNotifications, 0);
    assert.equal(endpoint, 'https://fcm.googleapis.com/fcm/send/expired-device');
  } finally {
    globalThis.fetch = originalFetch;
    f.close();
  }
});

test('WebAuthn challenges expire and can only be consumed once', () => {
  const f = fixture();
  try {
    const now = Date.now();
    f.sql.prepare(`INSERT INTO webauthn_challenges(id,user_id,ceremony,challenge,origin,rp_id,expires_at,created_at)
      VALUES('challenge-a','user-a','REGISTRATION','server-random-challenge',?, ?, ?, ?)`).run(ORIGIN, 'app.example.test', now + 300_000, now);
    const consume = () => f.sql.prepare(`UPDATE webauthn_challenges SET consumed_at=? WHERE id='challenge-a' AND ceremony='REGISTRATION'
      AND consumed_at IS NULL AND expires_at>? RETURNING id`).get(Date.now(), Date.now());
    assert.equal(consume().id, 'challenge-a');
    assert.equal(consume(), undefined);
    f.sql.prepare(`INSERT INTO webauthn_challenges(id,user_id,ceremony,challenge,origin,rp_id,expires_at,created_at)
      VALUES('expired-a','user-a','AUTHENTICATION','expired-challenge',?, ?, ?, ?)`).run(ORIGIN, 'app.example.test', now - 1, now);
    assert.equal(f.sql.prepare(`UPDATE webauthn_challenges SET consumed_at=? WHERE id='expired-a' AND expires_at>? RETURNING id`).get(Date.now(), Date.now()), undefined);
  } finally { f.close(); }
});
