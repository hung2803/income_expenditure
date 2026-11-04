# P10 — Tiết kiệm và định kỳ

## Hoàn thành

- Tạo, sửa, xóa và theo dõi nhiều mục tiêu tiết kiệm; ghi nhận các khoản đóng góp VND và tính số tiền/tiến độ đã dành.
- Quản lý giao dịch định kỳ ngày, tuần, tháng; chọn ví, danh mục, ngày bắt đầu và tạm dừng/bật lại/xóa lịch.
- Giao dịch định kỳ chỉ được ghi vào ledger sau khi người dùng xác nhận. Mỗi lịch/ngày đến hạn có khóa duy nhất để retry xác nhận không tạo giao dịch trùng.
- Nhắc khoản định kỳ vào ngày trước hạn và đúng ngày hạn; thông báo một lần khi đạt 25%, 50%, 75%, 100%, khi còn 7 ngày đến hạn và tổng kết tiết kiệm Chủ nhật lúc 21:00 theo timezone tài khoản.
- Dữ liệu được phân quyền theo `ownerUserId`, ghi audit khi Super Admin thay đổi dữ liệu và phát vào sync cursor để các thiết bị khác pull.
- Thêm migration `0012_p10_savings_recurring.sql` và áp dụng thành công cho D1 local.
- Thêm trang `/savings` và `/recurring`, tham chiếu thiết kế `SCR-11`/`SCR-12`; đặt liên kết trong **Khác → Quản lý tài chính**.

## Kiểm tra

- `npm.cmd run test:p10 --workspace @thu-chi/backend`: 2/2 test đạt, gồm tiến độ/mốc thông báo, chặn đọc chéo tài khoản, không ghi sổ trước xác nhận, xác nhận lặp không tạo bản ghi thứ hai và nhắc theo ngày địa phương có dedupe.
- `npm.cmd test`: toàn bộ bộ test hiện có đạt (74 test Vitest và các suite backend, bao gồm P10).
- `npm.cmd run lint`: đạt.
- `npm.cmd run typecheck`: đạt.
- `npm.cmd run build --workspace @thu-chi/frontend`: đạt; Vite còn cảnh báo chunk ứng dụng chính lớn hơn 500 kB.
- `npm.cmd run db:migrate:local`: migration 0012 áp dụng thành công. Wrangler in cảnh báo quyền ghi log EPERM ngoài workspace nhưng lệnh kết thúc mã 0 và xác nhận migration thành công.

## Quy tắc OQ-03

Để hoàn tất luồng thông báo khi chưa có lựa chọn khác, P10 dùng mặc định gần hạn = trước 7 ngày và tổng kết tuần = Chủ nhật 21:00 theo timezone tài khoản. Khi chưa lưu timezone, dùng `Asia/Bangkok`.
