import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

/**
 * Độ sâu lịch sử *trong app* theo từng mục lịch sử (location.key).
 * PUSH = mục trước + 1, REPLACE = giữ độ sâu mục trước, POP = độ sâu đã biết (không biết thì 0).
 * Chỉ nằm trong bộ nhớ: tải lại trang thì về 0 và nút Quay lại dùng đường dẫn dự phòng,
 * tránh `navigate(-1)` rời khỏi app hoặc quay về /login.
 */
const depthByKey = new Map<string, number>();
let currentKey = '';

/** Gắn một lần ở RootLayout để ghi nhận mọi điều hướng. */
export function useHistoryDepthTracker() {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (!depthByKey.has(location.key)) {
      const previous = depthByKey.get(currentKey) ?? 0;
      depthByKey.set(location.key, navigationType === 'PUSH' ? previous + 1 : navigationType === 'REPLACE' ? previous : 0);
    }
    currentKey = location.key;
  }, [location.key, navigationType]);
}

export function canGoBackInApp(key: string): boolean {
  return (depthByKey.get(key) ?? 0) > 0;
}

/**
 * Quay lại đúng trang trước trong app; không có trang trước (mở trực tiếp/tải lại) thì thay bằng `fallback`.
 * Chặn bấm lặp để không lùi hai bước rồi nhảy sang tab khác.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const leaving = useRef(false);
  useEffect(() => { leaving.current = false; }, [location.key]);
  return useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    if (canGoBackInApp(location.key)) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [fallback, location.key, navigate]);
}
