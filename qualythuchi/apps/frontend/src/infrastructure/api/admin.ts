import type { AuthUser } from '@thu-chi/contracts';
import { createHttpClient } from './http';

export interface AdminAuditEvent {
  id: string;
  actorUserId: string;
  actorUsername: string;
  ownerUserId: string;
  ownerUsername: string;
  entity: string;
  recordId: string;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: number;
}
export type AdminUser = AuthUser & { isActive: boolean; createdAt: number };

export function createAdminApi(baseUrl = '', fetcher: typeof fetch = fetch) {
  const http = createHttpClient(baseUrl, fetcher);
  return {
    listUsers: async (signal?: AbortSignal) => (await http.get<{ users: AdminUser[] }>('/api/admin/users', { signal })).users,
    createUser: async (input: { username: string; displayName: string; password: string }, csrfToken: string) =>
      (await http.post<{ user: AuthUser }>('/api/admin/users', input, { csrfToken })).user,
    updateUser: async (id: string, input: Partial<{ username: string; displayName: string; password: string; role: AuthUser['role']; isActive: boolean }>, csrfToken: string) =>
      (await http.put<{ user: AuthUser }>(`/api/admin/users/${encodeURIComponent(id)}`, input, { csrfToken })).user,
    deactivateUser: async (id: string, csrfToken: string) =>
      http.delete<void>(`/api/admin/users/${encodeURIComponent(id)}`, { csrfToken }),
    listAudit: async (limit = 100, signal?: AbortSignal) =>
      (await http.get<{ events: AdminAuditEvent[] }>(`/api/admin/audit?limit=${limit}`, { signal })).events
  };
}

export const adminApi = createAdminApi(import.meta.env.VITE_API_BASE_URL ?? '');
