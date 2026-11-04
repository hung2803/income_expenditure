interface Env {
  DB: D1Database;
  APP_ENV: import('@thu-chi/contracts').AppEnvironment;
  CORS_ORIGINS: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_SUBJECT?: string;
  VAPID_PRIVATE_KEY?: string;
  SUBSCRIPTION_ENCRYPTION_KEY?: string;
  WORKER_VERSION?: { id: string; tag?: string; timestamp?: string };
}
