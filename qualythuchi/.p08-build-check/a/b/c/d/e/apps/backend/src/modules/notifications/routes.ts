import { Hono } from 'hono';
import type { AuthEnvironment } from '../../middleware/auth';
import { requireAuth, requireCsrf, scopeOwner } from '../../middleware/auth';
import { AuthError } from '../auth/errors';
import { jsonBody } from '../auth/validation';

export const notificationRoutes = new Hono<AuthEnvironment>();

notificationRoutes.get('/notifications/push-key', (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY ?? '' }));

notificationRoutes.get('/users/:ownerUserId/notifications', requireAuth, scopeOwner, async (c) => {
  const ownerId = c.get('ownerUserId');
  const limit = Number(c.req.query('limit') ?? '50');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AuthError(400, 'INVALID_INPUT', 'Giới hạn thông báo không hợp lệ.');
  const [rows, unread, settings] = await Promise.all([
    c.env.DB.prepare(`SELECT id,kind,title,body,payload_json AS payloadJson,created_at AS createdAt,read_at AS readAt
      FROM notifications WHERE owner_user_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).bind(ownerId, limit).all(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id=? AND read_at IS NULL').bind(ownerId).first<{ count: number }>(),
    c.env.DB.prepare(`SELECT s.timezone,EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.owner_user_id=s.owner_user_id AND p.disabled_at IS NULL) AS pushEnabled
      FROM notification_settings s WHERE s.owner_user_id=?`).bind(ownerId).first<{ timezone: string; pushEnabled: number }>()
  ]);
  return c.json({ notifications: rows.results, unreadCount: unread?.count ?? 0,
    settings: settings ? { timezone: settings.timezone, pushEnabled: Boolean(settings.pushEnabled) } : { timezone: 'Asia/Bangkok', pushEnabled: false } });
});

notificationRoutes.put('/users/:ownerUserId/notifications/settings', requireAuth, scopeOwner, requireCsrf, async (c) => {
  const body = await jsonBody(c.req.raw);
  if (Object.keys(body).some((key) => !['timezone', 'pushEnabled'].includes(key))
    || typeof body.timezone !== 'string' || body.timezone.length > 64 || typeof body.pushEnabled !== 'boolean') {
    throw new AuthError(400, 'INVALID_INPUT', 'Thiết lập thông báo không hợp lệ.');
  }
  try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }); } catch { throw new AuthError(400, 'INVALID_INPUT', 'Múi giờ không hợp lệ.'); }
  const ownerId = c.get('ownerUserId');
  await c.env.DB.prepare(`INSERT INTO notification_settings(owner_user_id,timezone,push_enabled,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(owner_user_id) DO UPDATE SET timezone=excluded.timezone,push_enabled=excluded.push_enabled,updated_at=excluded.updated_at`)
    .bind(ownerId, body.timezone, Number(body.pushEnabled), Date.now()).run();
  return c.json({ timezone: body.timezone, pushEnabled: body.pushEnabled });
});

notificationRoutes.post('/users/:ownerUserId/notifications/subscriptions', requireAuth, scopeOwner, requireCsrf, async (c) => {
  const body = await jsonBody(c.req.raw, 16_384);
  if (Object.keys(body).some((key) => !['subscription', 'timezone'].includes(key))
    || !body.subscription || typeof body.subscription !== 'object' || Array.isArray(body.subscription)) {
    throw new AuthError(400, 'INVALID_INPUT', 'Đăng ký nhận thông báo không hợp lệ.');
  }
  const value = body.subscription as Record<string, unknown>;
  const endpoint = value.endpoint;
  const keys = value.keys as Record<string, unknown> | undefined;
  if (Object.keys(value).some((key) => !['endpoint', 'expirationTime', 'keys'].includes(key))
    || !keys || Object.keys(keys).some((key) => !['p256dh', 'auth'].includes(key))
    || typeof endpoint !== 'string' || endpoint.length > 2048 || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string'
    || (value.expirationTime !== null && (typeof value.expirationTime !== 'number' || !Number.isFinite(value.expirationTime)))) {
    throw new AuthError(400, 'INVALID_INPUT', 'Đăng ký nhận thông báo không hợp lệ.');
  }
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new AuthError(400, 'INVALID_INPUT', 'Địa chỉ dịch vụ thông báo không hợp lệ.'); }
  const pushHosts = ['fcm.googleapis.com', 'web.push.apple.com', 'push.apple.com', 'push.services.mozilla.com'];
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || !pushHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new AuthError(400, 'INVALID_INPUT', 'Nhà cung cấp thông báo này chưa được hỗ trợ.');
  }
  try {
    if (fromB64(keys.p256dh).length !== 65 || fromB64(keys.auth).length !== 16) throw new Error('Bad key lengths.');
  } catch { throw new AuthError(400, 'INVALID_INPUT', 'Khóa mã hóa của đăng ký thông báo không hợp lệ.'); }
  if (!c.env.SUBSCRIPTION_ENCRYPTION_KEY) throw new AuthError(503, 'NOTIFICATIONS_NOT_CONFIGURED', 'Thông báo đẩy chưa được cấu hình trên máy chủ.');
  const timezone = body.timezone;
  if (typeof timezone !== 'string' || timezone.length > 64) throw new AuthError(400, 'INVALID_INPUT', 'Múi giờ không hợp lệ.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new AuthError(400, 'INVALID_INPUT', 'Múi giờ không hợp lệ.'); }
  const key = await importEncryptionKey(c.env.SUBSCRIPTION_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value))));
  const encrypted = `${toB64(iv)}.${toB64(ciphertext)}`;
  const endpointHash = await sha256(endpoint);
  const id = crypto.randomUUID();
  const ownerId = c.get('ownerUserId');
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM push_subscriptions
    WHERE owner_user_id=? AND disabled_at IS NULL AND endpoint_hash<>?`).bind(ownerId, endpointHash).first<{ count: number }>();
  if ((count?.count ?? 0) >= 20) throw new AuthError(409, 'SUBSCRIPTION_LIMIT', 'Mỗi tài khoản có thể nhận thông báo trên tối đa 20 thiết bị.');
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO push_subscriptions(id,owner_user_id,endpoint_hash,subscription_ciphertext,created_at,updated_at,disabled_at)
      VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(owner_user_id,endpoint_hash) DO UPDATE SET subscription_ciphertext=excluded.subscription_ciphertext,updated_at=excluded.updated_at,disabled_at=NULL`)
      .bind(id, ownerId, endpointHash, encrypted, Date.now(), Date.now()),
    c.env.DB.prepare(`INSERT INTO notification_settings(owner_user_id,timezone,push_enabled,updated_at) VALUES(?,?,1,?)
      ON CONFLICT(owner_user_id) DO UPDATE SET timezone=excluded.timezone,push_enabled=1,updated_at=excluded.updated_at`).bind(ownerId, timezone, Date.now())
  ]);
  return c.json({ subscribed: true }, 201);
});

notificationRoutes.delete('/users/:ownerUserId/notifications/subscriptions', requireAuth, scopeOwner, requireCsrf, async (c) => {
  const body = await jsonBody(c.req.raw);
  if (Object.keys(body).some((key) => key !== 'endpoint') || typeof body.endpoint !== 'string' || body.endpoint.length > 2048) throw new AuthError(400, 'INVALID_INPUT', 'Đăng ký nhận thông báo không hợp lệ.');
  const hash = await sha256(body.endpoint);
  const ownerId = c.get('ownerUserId');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE push_subscriptions SET disabled_at=?,updated_at=? WHERE owner_user_id=? AND endpoint_hash=? AND disabled_at IS NULL')
      .bind(Date.now(), Date.now(), ownerId, hash),
    c.env.DB.prepare(`UPDATE notification_settings SET push_enabled=EXISTS(SELECT 1 FROM push_subscriptions p
      WHERE p.owner_user_id=? AND p.disabled_at IS NULL),updated_at=? WHERE owner_user_id=?`).bind(ownerId, Date.now(), ownerId)
  ]);
  return c.body(null, 204);
});

notificationRoutes.post('/users/:ownerUserId/notifications/:notificationId/read', requireAuth, scopeOwner, requireCsrf, async (c) => {
  const result = await c.env.DB.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND owner_user_id=?')
    .bind(Date.now(), c.req.param('notificationId'), c.get('ownerUserId')).run();
  if (!result.meta.changes) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy thông báo.');
  return c.json({ read: true });
});

notificationRoutes.post('/users/:ownerUserId/notifications/read-all', requireAuth, scopeOwner, requireCsrf, async (c) => {
  await c.env.DB.prepare('UPDATE notifications SET read_at=? WHERE owner_user_id=? AND read_at IS NULL').bind(Date.now(), c.get('ownerUserId')).run();
  return c.json({ read: true });
});

function toB64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}
async function importEncryptionKey(value: string) {
  let raw: Uint8Array<ArrayBuffer>;
  try { raw = fromB64(value); } catch { throw new AuthError(503, 'NOTIFICATIONS_NOT_CONFIGURED', 'Mã hóa đăng ký thông báo chưa được cấu hình đúng.'); }
  if (raw.length !== 32) throw new AuthError(503, 'NOTIFICATIONS_NOT_CONFIGURED', 'Khóa mã hóa đăng ký thông báo phải có 32 byte.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
}
async function sha256(value: string) {
  return toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

// Used by the scheduled worker; ciphertext is never exposed to clients or logs.
export async function decryptSubscription(ciphertext: string, env: Env): Promise<PushSubscriptionJSON> {
  if (!env.SUBSCRIPTION_ENCRYPTION_KEY) throw new Error('Subscription encryption is not configured.');
  const key = await importEncryptionKey(env.SUBSCRIPTION_ENCRYPTION_KEY);
  const [iv, data] = ciphertext.split('.');
  if (!iv || !data) throw new Error('Invalid encrypted subscription.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(data));
  return JSON.parse(new TextDecoder().decode(plain)) as PushSubscriptionJSON;
}

interface PushSubscriptionJSON { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string } }
