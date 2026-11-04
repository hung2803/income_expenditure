export class AuthError extends Error {
  status: 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 426 | 429 | 503;
  code: string;
  constructor(status: AuthError['status'], code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export const unauthorized = () => new AuthError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
export const forbidden = () => new AuthError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
export const conflict = (code = 'CONFLICT', message = 'Thao tác không thể hoàn tất do dữ liệu đang được sử dụng.') => new AuthError(409, code, message);
