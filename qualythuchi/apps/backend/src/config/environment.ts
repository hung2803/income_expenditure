import type { AppEnvironment } from '@thu-chi/contracts';

export class ConfigurationError extends Error {
  constructor() {
    super('Backend environment is not configured correctly.');
    this.name = 'ConfigurationError';
  }
}

export function getEnvironment(value: string): AppEnvironment {
  if (value === 'dev' || value === 'test' || value === 'prod') return value;
  throw new ConfigurationError();
}

export function getAllowedOrigins(value: string): string[] {
  if (typeof value !== 'string') throw new ConfigurationError();
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  return [...new Set(origins.map((origin) => {
    let url: URL;
    try { url = new URL(origin); } catch { throw new ConfigurationError(); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || origin.includes('*')) {
      throw new ConfigurationError();
    }
    return url.origin;
  }))];
}
