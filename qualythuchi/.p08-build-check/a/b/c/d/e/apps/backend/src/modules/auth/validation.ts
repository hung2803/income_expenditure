import { AuthError } from './errors.ts';
import { accountUsername } from './identity.ts';

export function normalizeUsername(value: unknown): string {
  if (typeof value === 'string') {
    try { return accountUsername(value); } catch { /* Return the public validation error below. */ }
  }
  throw new AuthError(400, 'INVALID_INPUT', 'Tên đăng nhập phải có 1–64 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.');
}

export async function jsonBody(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) throw new AuthError(415, 'JSON_REQUIRED', 'Yêu cầu phải dùng JSON.');
  if (!request.body) throw new AuthError(400, 'INVALID_INPUT', 'Thiếu nội dung yêu cầu.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AuthError(413, 'BODY_TOO_LARGE', 'Nội dung yêu cầu quá lớn.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); } catch { throw new AuthError(400, 'INVALID_INPUT', 'JSON không hợp lệ.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError(400, 'INVALID_INPUT', 'Nội dung yêu cầu không hợp lệ.');
  return value as Record<string, unknown>;
}
