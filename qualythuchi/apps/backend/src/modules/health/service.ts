import type { HealthResponse } from '@thu-chi/contracts';

export async function checkHealth(env: Pick<Env, 'DB' | 'APP_ENV'>): Promise<HealthResponse> {
  try {
    const metadata = await env.DB.prepare("SELECT value FROM app_metadata WHERE key = 'schema_version'").first<{ value: string }>();
    if (!metadata || !/^\d+$/.test(metadata.value) || Number(metadata.value) < 12) throw new Error('Database schema is not ready.');
    return { status: 'ok', service: 'thu-chi-api', environment: env.APP_ENV, checks: { database: 'ok' } };
  } catch {
    // Never expose database/driver messages or bindings in the public response.
    return { status: 'degraded', service: 'thu-chi-api', environment: env.APP_ENV, checks: { database: 'error' } };
  }
}
