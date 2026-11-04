import { Hono } from 'hono';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  WebAuthnCredential
} from '@simplewebauthn/server';
import type { AuthEnvironment } from '../../middleware/auth';
import { requireAuth, requireCsrf } from '../../middleware/auth';
import { trustedForwardedOrigin } from '../../config/proxy-origin.ts';
import { AuthError } from './errors.ts';
import { jsonBody } from './validation.ts';
import { AuthRepository, publicUser } from './repository.ts';
import { checkRequestOrigin, SESSION_LIFETIME_MS } from './config.ts';
import { checkCsrf } from './service.ts';
import type { AuthenticatedSession } from './service.ts';
import { csrfForSession, hashToken, newSessionToken, readSessionToken, sessionCookie } from './tokens.ts';

export const passkeyRoutes = new Hono<AuthEnvironment>();
const challengeLifetimeMs = 5 * 60_000;

interface StoredChallenge {
  id: string; user_id: string | null; ceremony: 'REGISTRATION' | 'AUTHENTICATION';
  challenge: string; origin: string; rp_id: string; expires_at: number; consumed_at: number | null;
}
interface StoredCredential {
  id: string; user_id: string; public_key: string; counter: number;
  transports_json: string; name: string; device_type: string; backed_up: number;
}

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
};
const fromBase64Url = (value: string) => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

function ceremonyContext(request: Request, env: Env) {
  checkRequestOrigin(request, env, true);
  const origin = trustedForwardedOrigin(request, env.APP_ENV) ?? request.headers.get('Origin');
  if (!origin) throw new AuthError(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn truy cập không được phép.');
  let url: URL;
  try { url = new URL(origin); } catch { throw new AuthError(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn truy cập không được phép.'); }
  if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new AuthError(426, 'HTTPS_REQUIRED', 'Passkey cần kết nối HTTPS.');
  }
  return { origin: url.origin, rpId: url.hostname };
}

async function reservePasskeyAttempt(env: Env, request: Request, bucket: string) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!await new AuthRepository(env.DB).reserveLogin(`passkey:${bucket}`, ip, Date.now())) {
    throw new AuthError(429, 'RATE_LIMITED', 'Bạn đã thử quá nhiều lần. Vui lòng đợi rồi thử lại.');
  }
}

async function makeChallenge(env: Env, input: Omit<StoredChallenge, 'consumed_at'>) {
  await env.DB.prepare(`DELETE FROM webauthn_challenges WHERE expires_at<=? OR consumed_at IS NOT NULL`).bind(Date.now()).run();
  await env.DB.prepare(`INSERT INTO webauthn_challenges(id,user_id,ceremony,challenge,origin,rp_id,expires_at,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(input.id, input.user_id, input.ceremony, input.challenge, input.origin,
    input.rp_id, input.expires_at, Date.now()).run();
}

async function consumeChallenge(env: Env, id: unknown, ceremony: StoredChallenge['ceremony'], userId?: string): Promise<StoredChallenge> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/iu.test(id)) throw new AuthError(400, 'INVALID_INPUT', 'Yêu cầu xác minh passkey không hợp lệ.');
  const now = Date.now();
  const query = `UPDATE webauthn_challenges SET consumed_at=? WHERE id=? AND ceremony=? AND consumed_at IS NULL AND expires_at>?${userId === undefined ? '' : ' AND user_id=?'} RETURNING id,user_id,ceremony,challenge,origin,rp_id,expires_at,consumed_at`;
  const statement = env.DB.prepare(query).bind(now, id, ceremony, now, ...(userId === undefined ? [] : [userId]));
  const row = await statement.first<StoredChallenge>();
  if (!row) throw new AuthError(400, 'PASSKEY_CHALLENGE_INVALID', 'Yêu cầu passkey đã hết hạn hoặc không còn hợp lệ. Hãy thử lại.');
  return row;
}

function parseName(value: unknown) {
  if (value === undefined) return 'Passkey';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 40 || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new AuthError(400, 'INVALID_INPUT', 'Tên passkey cần từ 1 đến 40 ký tự.');
  }
  return value.trim();
}

async function issueSession(request: Request, env: Env, userId: string) {
  const repository = new AuthRepository(env.DB);
  const user = await repository.findUserById(userId);
  if (!user || user.is_active !== 1) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Passkey không hợp lệ.');
  const now = Date.now();
  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const old = readSessionToken(request, env);
  if (!await repository.createSession(user, tokenHash, old ? hashToken(old) : null, now, now + SESSION_LIFETIME_MS)) {
    throw new AuthError(401, 'INVALID_CREDENTIALS', 'Passkey không hợp lệ.');
  }
  const session = await repository.findSession(tokenHash, now);
  if (!session) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Passkey không hợp lệ.');
  const body: AuthenticatedSession['dto'] = {
    user: publicUser(session), expiresAt: new Date(session.expires_at).toISOString(), csrfToken: csrfForSession(token)
  };
  return Response.json(body, { headers: { 'Set-Cookie': sessionCookie(request, env, token), 'Cache-Control': 'no-store' } });
}

passkeyRoutes.get('/', requireAuth, async (c) => {
  const ownerId = c.get('auth').dto.user.id;
  const result = await c.env.DB.prepare(`SELECT id,name,device_type AS deviceType,backed_up AS backedUp,created_at AS createdAt,last_used_at AS lastUsedAt
    FROM passkey_credentials WHERE user_id=? ORDER BY created_at DESC,id`).bind(ownerId).all<{
      id: string; name: string; deviceType: string; backedUp: number; createdAt: number; lastUsedAt: number | null;
    }>();
  return c.json({ passkeys: result.results.map((row) => ({ ...row, backedUp: Boolean(row.backedUp) })) });
});

passkeyRoutes.post('/register/options', requireAuth, requireCsrf, async (c) => {
  await reservePasskeyAttempt(c.env, c.req.raw, 'register-options');
  const auth = c.get('auth');
  const context = ceremonyContext(c.req.raw, c.env);
  const body = await jsonBody(c.req.raw);
  if (Object.keys(body).some((key) => key !== 'name')) throw new AuthError(400, 'INVALID_INPUT', 'Yêu cầu đăng ký passkey không hợp lệ.');
  const name = parseName(body.name);
  const user = auth.dto.user;
  const existing = await c.env.DB.prepare('SELECT id,transports_json FROM passkey_credentials WHERE user_id=? ORDER BY created_at LIMIT 50')
    .bind(user.id).all<{ id: string; transports_json: string }>();
  if (existing.results.length >= 20) throw new AuthError(409, 'PASSKEY_LIMIT', 'Mỗi tài khoản có thể đăng ký tối đa 20 passkey.');
  const options = await generateRegistrationOptions({
    rpName: 'Quản lý thu chi', rpID: context.rpId,
    userID: Uint8Array.from(new TextEncoder().encode(user.id)), userName: user.username, userDisplayName: user.displayName,
    attestationType: 'none', supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: existing.results.map((row) => ({
      id: row.id,
      transports: JSON.parse(row.transports_json) as Array<'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid'>
    }))
  });
  const ceremonyId = crypto.randomUUID();
  await makeChallenge(c.env, {
    id: ceremonyId, user_id: user.id, ceremony: 'REGISTRATION', challenge: options.challenge,
    origin: context.origin, rp_id: context.rpId, expires_at: Date.now() + challengeLifetimeMs
  });
  return c.json({ ceremonyId, options, name });
});

passkeyRoutes.post('/register/verify', requireAuth, requireCsrf, async (c) => {
  await reservePasskeyAttempt(c.env, c.req.raw, 'register-verify');
  const auth = c.get('auth');
  checkCsrf(c.req.raw, c.env, auth);
  const body = await jsonBody(c.req.raw, 65_536);
  if (Object.keys(body).some((key) => !['ceremonyId', 'credential', 'name'].includes(key))
    || !body.credential || typeof body.credential !== 'object' || Array.isArray(body.credential)) {
    throw new AuthError(400, 'INVALID_INPUT', 'Thông tin passkey không hợp lệ.');
  }
  const challenge = await consumeChallenge(c.env, body.ceremonyId, 'REGISTRATION', auth.dto.user.id);
  try {
    const verification = await verifyRegistrationResponse({
      response: body.credential as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257]
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error('Registration was not verified.');
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const transports = credential.transports ?? [];
    await c.env.DB.prepare(`INSERT INTO passkey_credentials(id,user_id,public_key,counter,transports_json,name,device_type,backed_up,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(credential.id, auth.dto.user.id, toBase64Url(credential.publicKey), credential.counter,
      JSON.stringify(transports), parseName(body.name), credentialDeviceType, credentialBackedUp ? 1 : 0, Date.now()).run();
    return c.json({ verified: true });
  } catch (error) {
    if (error instanceof AuthError) throw error;
    const message = error instanceof Error && /UNIQUE constraint failed: passkey_credentials\.id/u.test(error.message)
      ? 'Passkey này đã được đăng ký.' : 'Không thể xác minh passkey. Hãy bắt đầu đăng ký lại.';
    throw new AuthError(message === 'Passkey này đã được đăng ký.' ? 409 : 400,
      message === 'Passkey này đã được đăng ký.' ? 'PASSKEY_EXISTS' : 'PASSKEY_VERIFICATION_FAILED', message);
  }
});

passkeyRoutes.delete('/:credentialId', requireAuth, requireCsrf, async (c) => {
  const ownerId = c.get('auth').dto.user.id;
  const id = c.req.param('credentialId');
  const result = await c.env.DB.prepare('DELETE FROM passkey_credentials WHERE user_id=? AND id=?').bind(ownerId, id).run();
  if (!result.meta.changes) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy passkey.');
  return c.body(null, 204);
});

passkeyRoutes.post('/login/options', async (c) => {
  const context = ceremonyContext(c.req.raw, c.env);
  await reservePasskeyAttempt(c.env, c.req.raw, 'options');
  const options = await generateAuthenticationOptions({ rpID: context.rpId, userVerification: 'required' });
  const ceremonyId = crypto.randomUUID();
  await makeChallenge(c.env, {
    id: ceremonyId, user_id: null, ceremony: 'AUTHENTICATION', challenge: options.challenge,
    origin: context.origin, rp_id: context.rpId, expires_at: Date.now() + challengeLifetimeMs
  });
  return c.json({ ceremonyId, options });
});

passkeyRoutes.post('/login/verify', async (c) => {
  const context = ceremonyContext(c.req.raw, c.env);
  await reservePasskeyAttempt(c.env, c.req.raw, 'verify');
  const body = await jsonBody(c.req.raw, 65_536);
  if (Object.keys(body).some((key) => !['ceremonyId', 'credential'].includes(key))
    || !body.credential || typeof body.credential !== 'object' || Array.isArray(body.credential)) {
    throw new AuthError(400, 'INVALID_INPUT', 'Thông tin passkey không hợp lệ.');
  }
  const response = body.credential as AuthenticationResponseJSON;
  if (typeof response.id !== 'string' || response.id.length > 1024) throw new AuthError(400, 'INVALID_INPUT', 'Thông tin passkey không hợp lệ.');
  const challenge = await consumeChallenge(c.env, body.ceremonyId, 'AUTHENTICATION');
  if (challenge.origin !== context.origin || challenge.rp_id !== context.rpId) throw new AuthError(400, 'PASSKEY_CHALLENGE_INVALID', 'Yêu cầu passkey không còn hợp lệ. Hãy thử lại.');
  const row = await c.env.DB.prepare(`SELECT id,user_id,public_key,counter,transports_json,name,device_type,backed_up
    FROM passkey_credentials WHERE id=?`).bind(response.id).first<StoredCredential>();
  if (!row) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Passkey không hợp lệ.');
  try {
    const credential: WebAuthnCredential = {
      id: row.id, publicKey: fromBase64Url(row.public_key), counter: row.counter,
      transports: JSON.parse(row.transports_json)
    };
    const verification = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id, credential, requireUserVerification: true
    });
    if (!verification.verified || !verification.authenticationInfo.userVerified) throw new Error('Passkey user verification failed.');
    const now = Date.now();
    await c.env.DB.prepare(`UPDATE passkey_credentials SET counter=?,device_type=?,backed_up=?,last_used_at=? WHERE id=? AND user_id=?`)
      .bind(verification.authenticationInfo.newCounter, verification.authenticationInfo.credentialDeviceType,
        verification.authenticationInfo.credentialBackedUp ? 1 : 0, now, row.id, row.user_id).run();
    return issueSession(c.req.raw, c.env, row.user_id);
  } catch {
    throw new AuthError(401, 'INVALID_CREDENTIALS', 'Passkey không hợp lệ.');
  }
});
