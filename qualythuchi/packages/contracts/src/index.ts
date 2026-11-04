export type AppEnvironment = 'dev' | 'test' | 'prod';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: 'thu-chi-api';
  environment: AppEnvironment;
  checks: { database: 'ok' | 'error' };
}

export interface ApiErrorResponse {
  error: { code: string; message: string };
}

export type UserRole = 'USER' | 'SUPER_ADMIN';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

// /auth/login and /auth/me return this body. The session cookie is HttpOnly;
// the CSRF token is kept only in memory and sent on authenticated mutations.
export interface AuthSession {
  user: AuthUser;
  expiresAt: string;
  csrfToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}
