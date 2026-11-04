import { FileQuestion } from 'lucide-react';
import { SystemPage } from './SystemPage';

export function NotFoundPage() {
  return <SystemPage icon={<FileQuestion />} title="Không tìm thấy trang">
    <p>Đường dẫn này không tồn tại hoặc đã thay đổi.</p>
  </SystemPage>;
}
