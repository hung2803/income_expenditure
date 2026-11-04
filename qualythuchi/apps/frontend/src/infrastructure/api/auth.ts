import type { LoginRequest } from '@thu-chi/contracts';
import type { AuthApi } from '../../features/auth/session';
import { parseSession } from '../../features/auth/session';
import { createHttpClient } from './http';

export function createAuthApi(baseUrl = '', fetcher: typeof fetch = fetch): AuthApi {
  const http = createHttpClient(baseUrl, fetcher);
  return {
    me: async (signal) => parseSession(await http.get<unknown>('/auth/me', { signal })),
    login: async (credentials: LoginRequest, signal) => parseSession(await http.post<unknown>('/auth/login', credentials, { signal })),
    logout: async (csrfToken, signal) => { await http.post<void>('/auth/logout', {}, { csrfToken, signal }); }
  };
}
