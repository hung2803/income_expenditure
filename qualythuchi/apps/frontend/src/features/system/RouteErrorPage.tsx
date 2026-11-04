import { CircleAlert } from 'lucide-react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { SystemPage } from './SystemPage';
import { NotFoundPage } from './NotFoundPage';

export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return <SystemPage icon={<CircleAlert />} title="Chưa thể mở màn hình này" retry>
    <p>Vui lòng thử tải lại trang. Nếu lỗi vẫn còn, bạn có thể quay về màn hình đăng nhập.</p>
  </SystemPage>;
}
