import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpClient } from './http';
import { normalizeApiBaseUrl } from './url';

describe('API configuration and transport', () => {
  it('uses same-origin by default and normalizes an explicit backend origin', () => {
    expect(normalizeApiBaseUrl('')).toBe('');
    expect(normalizeApiBaseUrl(' https://api.example.com/ ')).toBe('https://api.example.com');
    for (const invalid of ['/api', 'https://api.example.com/api', 'https://user:secret@api.example.com', 'file:///api', 'https://api.example.com?token=secret']) {
      expect(() => normalizeApiBaseUrl(invalid)).toThrow();
    }
  });

  it('requests the configured backend with credentials and without caching', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'ok' }));
    await expect(createHttpClient('https://api.example.com/', fetcher).get('/api/health')).resolves.toEqual({ status: 'ok' });
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/api/health', expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
  });

  it('distinguishes API rejection, invalid response, and a network failure', async () => {
    const forbidden = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 403 }));
    await expect(createHttpClient('', forbidden).get('/api/health')).rejects.toMatchObject({ code: 'HTTP', status: 403 });
    const html = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }));
    await expect(createHttpClient('', html).get('/api/health')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const broken = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createHttpClient('', broken).get('/api/health')).rejects.toBeInstanceOf(ApiError);
    await expect(createHttpClient('', broken).get('/api/health')).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('preserves the server auth failure code for session diagnostics', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'SESSION_COOKIE_MISSING' } }, { status: 401 }));
    await expect(createHttpClient('', fetcher).get('/auth/me')).rejects.toMatchObject({ status: 401, serverCode: 'SESSION_COOKIE_MISSING' });
  });

  it('aborts a hanging request after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      const request = createHttpClient('', fetcher).get('/api/health');
      const assertion = expect(request).rejects.toMatchObject({ code: 'TIMEOUT' });
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
