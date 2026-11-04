import { describe, expect, it, vi } from 'vitest';
import { app } from './app';
import { getAllowedOrigins } from './config/environment';

function bindings(overrides: Partial<Env> = {}): Env {
  return {
    APP_ENV: 'dev',
    CORS_ORIGINS: 'http://127.0.0.1:5173',
    DB: { prepare: vi.fn(() => ({ first: vi.fn().mockResolvedValue({ value: '12' }) })) } as unknown as D1Database,
    ...overrides
  };
}

describe('API foundation', () => {
  it('identifies the deployed preview version when version metadata is bound', async () => {
    const version = '12345678-1234-4234-8234-123456789001';
    const response = await app.request('/api/health', {}, bindings({ WORKER_VERSION: { id: version } }));
    expect(response.headers.get('X-Worker-Version')).toBe(version);
    const local = await app.request('/api/health', {}, bindings());
    expect(local.headers.get('X-Worker-Version')).toBeNull();
  });

  it('checks migrated D1 and returns the active environment with no-store headers', async () => {
    for (const environment of ['dev', 'test', 'prod'] as const) {
      const response = await app.request('/api/health', {}, bindings({ APP_ENV: environment, CORS_ORIGINS: environment === 'prod' ? 'https://app.example.com' : 'http://127.0.0.1:5173' }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok', service: 'thu-chi-api', environment, checks: { database: 'ok' } });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    }
  });

  it('returns 503 when D1/migration is unavailable without exposing driver messages', async () => {
    for (const first of [vi.fn().mockRejectedValue(new Error('driver secret=value')), vi.fn().mockResolvedValue(null)]) {
      const response = await app.request('/api/health', {}, bindings({ DB: { prepare: () => ({ first }) } as unknown as D1Database }));
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(JSON.parse(body)).toMatchObject({ status: 'degraded', checks: { database: 'error' } });
      expect(body).not.toContain('secret');
    }
  });

  it('allows credentials only for an exact configured browser origin', async () => {
    const response = await app.request('/api/health', { headers: { Origin: 'http://127.0.0.1:5173' } }, bindings());
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:5173');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('rejects hostile and null origins before accessing D1', async () => {
    for (const origin of ['https://untrusted.example', 'http://127.0.0.1:5173.evil.example', 'null']) {
      const env = bindings();
      const response = await app.request('/api/health', { headers: { Origin: origin } }, env);
      expect(response.status).toBe(403);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
      expect(env.DB.prepare).not.toHaveBeenCalled();
    }
  });

  it('allows a validated HTTPS development tunnel origin and rejects forged forwarding headers', async () => {
    const publicOrigin = 'https://sample.run.pinggy-free.link';
    const forwarded = {
      Origin: 'http://127.0.0.1:8787',
      'X-Forwarded-Origin': publicOrigin,
      'X-Forwarded-Host': 'sample.run.pinggy-free.link',
      'X-Forwarded-Proto': 'https'
    };
    const response = await app.fetch(new Request('http://127.0.0.1:8787/api/health', { headers: forwarded }), bindings());
    expect(response.status).toBe(200);
    // The frontend proxy rewrites Origin to its backend target; browser traffic
    // is same-origin at the public tunnel, so the backend must not echo a CORS origin.
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');

    const forged = await app.fetch(new Request('http://127.0.0.1:8787/api/health', { headers: { ...forwarded, Origin: 'https://evil.example' } }), bindings());
    expect(forged.status).toBe(403);
    const mismatched = await app.fetch(new Request('http://127.0.0.1:8787/api/health', { headers: { ...forwarded, Origin: publicOrigin, 'X-Forwarded-Host': 'evil.example' } }), bindings());
    expect(mismatched.status).toBe(403);
  });

  it('responds to allowed preflight without querying the database', async () => {
    const env = bindings();
    const response = await app.request('/api/health', {
      method: 'OPTIONS',
      headers: { Origin: env.CORS_ORIGINS, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-csrf-token' }
    }, env);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(env.CORS_ORIGINS);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('rejects unsupported preflight methods and headers', async () => {
    for (const [method, headers] of [['TRACE', 'content-type'], ['POST', 'x-admin-role']]) {
      const response = await app.request('/api/health', {
        method: 'OPTIONS',
        headers: { Origin: 'http://127.0.0.1:5173', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': headers }
      }, bindings());
      expect(response.status).toBe(403);
    }
  });

  it('fails closed for wildcard or invalid environment configuration', async () => {
    for (const overrides of [{ CORS_ORIGINS: '*' }, { APP_ENV: 'unknown' as Env['APP_ENV'] }, { APP_ENV: 'prod' as const, CORS_ORIGINS: 'http://app.example.com' }]) {
      const response = await app.request('/api/health', {}, bindings(overrides));
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: { code: 'CONFIGURATION_ERROR' } });
    }
    expect(getAllowedOrigins(' https://app.example.com/,https://app.example.com ')).toEqual(['https://app.example.com']);
    expect(() => getAllowedOrigins('https://user:password@app.example.com')).toThrow();
    expect(() => getAllowedOrigins('https://app.example.com/path')).toThrow();
  });

  it('keeps a consistent JSON error and security headers for missing API routes', async () => {
    const response = await app.request('/api/missing', {}, bindings());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
