import { normalizeApiBaseUrl } from './url';

export class ApiError extends Error {
  constructor(public readonly code: 'NETWORK' | 'TIMEOUT' | 'HTTP' | 'INVALID_RESPONSE' | 'CANCELLED', message: string, public readonly status?: number, public readonly serverCode?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions { signal?: AbortSignal; csrfToken?: string }

export function createHttpClient(baseUrl = '', fetcher: typeof fetch = fetch) {
  const origin = normalizeApiBaseUrl(baseUrl);
  const reads = new Map<string, { controller: AbortController; promise: Promise<unknown>; readers: number }>();
  async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body: unknown, options: RequestOptions): Promise<T> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const cancel = () => controller.abort();
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
      try {
        const response = await fetcher(`${origin}${path}`, {
          method,
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
          redirect: 'error',
          headers: {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {})
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
        if (!response.ok) {
          let serverCode: string | undefined;
          try {
            const payload = await response.clone().json() as { error?: { code?: unknown } };
            if (typeof payload.error?.code === 'string') serverCode = payload.error.code;
          } catch { /* Some proxies return a non-JSON error page. */ }
          throw new ApiError('HTTP', 'Hệ thống chưa xử lý được yêu cầu. Vui lòng thử lại.', response.status, serverCode);
        }
        if (response.status === 204) return undefined as T;
        if (!response.headers.get('content-type')?.includes('application/json')) {
          throw new ApiError('INVALID_RESPONSE', 'Hệ thống trả về dữ liệu không hợp lệ.');
        }
        try {
          return await response.json() as T;
        } catch {
          throw new ApiError('INVALID_RESPONSE', 'Hệ thống trả về dữ liệu không hợp lệ.');
        }
      } catch (error) {
        if (options.signal?.aborted) throw new ApiError('CANCELLED', 'Yêu cầu đã được hủy.');
        if (controller.signal.aborted) throw new ApiError('TIMEOUT', 'Kết nối mất quá nhiều thời gian. Vui lòng thử lại.');
        if (error instanceof ApiError) throw error;
        throw new ApiError('NETWORK', 'Không kết nối được hệ thống. Vui lòng kiểm tra mạng và thử lại.');
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', cancel);
      }
  }
  function get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (options.signal?.aborted) return Promise.reject(new ApiError('CANCELLED', 'Yêu cầu đã được hủy.'));
    let flight = reads.get(path);
    if (!flight) {
      const controller = new AbortController();
      flight = { controller, readers: 0, promise: request<T>('GET', path, undefined, { ...options, signal: controller.signal }) };
      const created = flight;
      reads.set(path, created);
      void created.promise.finally(() => { if (reads.get(path) === created) reads.delete(path); }).catch(() => undefined);
    }
    const shared = flight;
    shared.readers++;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return false;
        done = true;
        options.signal?.removeEventListener('abort', cancel);
        if (--shared.readers === 0) {
          shared.controller.abort();
          if (reads.get(path) === shared) reads.delete(path);
        }
        return true;
      };
      const cancel = () => { if (finish()) reject(new ApiError('CANCELLED', 'Yêu cầu đã được hủy.')); };
      options.signal?.addEventListener('abort', cancel, { once: true });
      shared.promise.then((value) => { if (finish()) resolve(structuredClone(value) as T); }, (error: unknown) => { if (finish()) reject(error); });
    });
  }
  return {
    get,
    post: <T>(path: string, body?: unknown, options: RequestOptions = {}) => request<T>('POST', path, body ?? {}, options),
    put: <T>(path: string, body: unknown, options: RequestOptions = {}) => request<T>('PUT', path, body, options),
    patch: <T>(path: string, body: unknown, options: RequestOptions = {}) => request<T>('PATCH', path, body, options),
    delete: <T>(path: string, options: RequestOptions = {}) => request<T>('DELETE', path, undefined, options)
  };
}
