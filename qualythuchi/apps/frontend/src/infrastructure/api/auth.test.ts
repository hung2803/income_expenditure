import { describe, expect, it, vi } from 'vitest';
import { createAuthApi } from './auth';

const session = { user: { id: 'a', username: 'an', displayName: 'An', role: 'USER' }, expiresAt: '2099-01-01T00:00:00Z', csrfToken: 'memory-token' };

describe('cookie-based auth adapter', () => {
  it('sends username/password as JSON with credentials and no-store, then validates the role', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(session));
    const api = createAuthApi('https://api.example.com', fetcher);
    expect((await api.login({ username: 'an', password: 'test' })).user.role).toBe('USER');
    expect(fetcher).toHaveBeenCalledWith('https://api.example.com/auth/login', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ username: 'an', password: 'test' }), credentials: 'include', cache: 'no-store', redirect: 'error'
    }));
    fetcher.mockResolvedValueOnce(Response.json({ ...session, user: { ...session.user, role: 'admin' } }));
    await expect(api.me()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('sends CSRF for logout and accepts an empty 204 response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await createAuthApi('', fetcher).logout('csrf-only-in-memory');
    expect(fetcher).toHaveBeenCalledWith('/auth/logout', expect.objectContaining({
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-only-in-memory', 'Content-Type': 'application/json' })
    }));
  });

  it('propagates cancellation so a stale session cannot finish after logout', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const controller = new AbortController();
    const request = createAuthApi('', fetcher).me(controller.signal);
    const result = expect(request).rejects.toMatchObject({ code: 'CANCELLED' });
    controller.abort();
    await result;
  });
});
