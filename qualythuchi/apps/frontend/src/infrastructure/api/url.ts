export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('VITE_API_BASE_URL phải để trống hoặc là origin HTTP/HTTPS hợp lệ.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('VITE_API_BASE_URL chỉ chứa origin, ví dụ https://api.example.com; không thêm /api, query hoặc thông tin đăng nhập.');
  }
  return url.origin;
}
