import type { HealthResponse } from '@thu-chi/contracts';
import { createHttpClient } from './http';

const http = createHttpClient(import.meta.env.VITE_API_BASE_URL ?? '');
export const api = { health: () => http.get<HealthResponse>('/api/health') };
