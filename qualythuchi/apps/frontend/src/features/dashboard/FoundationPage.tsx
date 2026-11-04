import { useState } from 'react';
import { api } from '../../infrastructure/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';

export function FoundationPage() {
  const [status, setStatus] = useState('Chưa kiểm tra');
  const [pending, setPending] = useState(false);

  async function checkConnection() {
    setPending(true);
    try {
      const health = await api.health();
      setStatus(health.status === 'ok' ? 'Đã kết nối backend' : 'Phản hồi không hợp lệ');
    } catch {
      setStatus(navigator.onLine ? 'Không kết nối được backend. Vui lòng thử lại.' : 'Thiết bị đang offline. Vui lòng kết nối mạng để kiểm tra.');
    } finally {
      setPending(false);
    }
  }

  return <Card>
    <CardHeader>
      <CardTitle>Khởi tạo ứng dụng</CardTitle>
      <CardDescription>Nền tảng đã sẵn sàng để phát triển các chức năng quản lý thu chi.</CardDescription>
    </CardHeader>
    <CardContent>
      <Button disabled={pending} onClick={checkConnection}>{pending ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}</Button>
      <p role="status" className="mt-3 text-sm text-muted-foreground">{status}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/login">Màn hình đăng nhập</Link></Button>
        <Button asChild variant="outline"><Link to="/offline">Trạng thái mạng</Link></Button>
      </div>
    </CardContent>
  </Card>;
}
