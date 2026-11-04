import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useGoBack } from '@/hooks/use-go-back';

/**
 * Liên kết Quay lại: về đúng trang trước trong app, không có thì về `to` (dự phòng).
 * Vẫn render thẻ <a> như trước để giữ CSS của từng màn hình.
 */
export function BackLink({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode; 'aria-label': string }) {
  const goBack = useGoBack(to);
  return <Link to={to} className={className} aria-label={rest['aria-label']} onClick={(event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goBack();
  }}>{children}</Link>;
}
