import type { AuthUser, UserRole } from '@thu-chi/contracts';
import { RATE_WINDOW_MS } from './config.ts';
import { hashToken } from './tokens.ts';

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  password_hash: string;
  is_active: number;
  auth_version: number;
}

export interface SessionRow extends Pick<UserRow, 'id' | 'username' | 'display_name' | 'role'> {
  expires_at: number;
}

export const publicUser = (row: Pick<UserRow, 'id' | 'username' | 'display_name' | 'role'>): AuthUser => ({
  id: row.id, username: row.username, displayName: row.display_name, role: row.role
});

export class AuthRepository {
  private db: D1DatabaseSession;

  constructor(database: D1Database) {
    // Revocation/disabled accounts must be read on the primary even if D1 read
    // replication is enabled later. Never authenticate against a stale replica.
    this.db = database.withSession('first-primary');
  }

  findUser(username: string) {
    return this.db.prepare('SELECT id, username, display_name, role, password_hash, is_active, auth_version FROM users WHERE username = ?').bind(username).first<UserRow>();
  }

  findUserById(id: string) {
    return this.db.prepare('SELECT id, username, display_name, role, password_hash, is_active, auth_version FROM users WHERE id = ?').bind(id).first<UserRow>();
  }

  findSession(tokenHash: string, now: number) {
    return this.db.prepare(`SELECT u.id, u.username, u.display_name, u.role, s.expires_at
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      AND u.is_active = 1 AND u.auth_version = s.auth_version`).bind(tokenHash, now).first<SessionRow>();
  }

  async reserveLogin(username: string, ip: string, now: number): Promise<boolean> {
    const window = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
    const reserve = (kind: string, value: string) => this.db.prepare(`INSERT INTO auth_rate_limits (key, window_start, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN window_start = excluded.window_start THEN attempts + 1 ELSE 1 END,
      window_start = excluded.window_start RETURNING attempts`).bind(hashToken(`${kind}:${value}`), window);
    const results = await this.db.batch<{ attempts: number }>([
      reserve('username', username), reserve('ip', ip),
      this.db.prepare('DELETE FROM auth_rate_limits WHERE key IN (SELECT key FROM auth_rate_limits WHERE window_start < ? LIMIT 100)').bind(now - 86_400_000)
    ]);
    return results[0].results[0].attempts <= 10 && results[1].results[0].attempts <= 60;
  }

  async createSession(user: UserRow, tokenHash: string, oldHash: string | null, now: number, expiresAt: number): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO sessions (token_hash, user_id, auth_version, created_at, expires_at)
        SELECT ?, id, auth_version, ?, ? FROM users WHERE id = ? AND password_hash = ? AND auth_version = ? AND is_active = 1`)
        .bind(tokenHash, now, expiresAt, user.id, user.password_hash, user.auth_version),
      this.db.prepare(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?)`)
        .bind(now, oldHash, tokenHash),
      this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?)')
        .bind(now, user.id, tokenHash),
      this.db.prepare('DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at <= ? LIMIT 100)').bind(now)
    ]);
    return results[0].meta.changes === 1;
  }

  revoke(tokenHash: string, now: number) {
    return this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(now, tokenHash).run();
  }

  profile(id: string) {
    return this.db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').bind(id).first<Pick<UserRow, 'id' | 'username' | 'display_name' | 'role'>>();
  }

  async listUsers(): Promise<Array<AuthUser & { isActive: boolean; createdAt: number }>> {
    const result = await this.db.prepare('SELECT id, username, display_name, role, is_active AS isActive, created_at AS createdAt FROM users ORDER BY created_at DESC, id LIMIT 100').all<Pick<UserRow, 'id' | 'username' | 'display_name' | 'role'> & { isActive: number; createdAt: number }>();
    return result.results.map((row) => ({ ...publicUser(row), isActive: Boolean(row.isActive), createdAt: row.createdAt }));
  }
}
