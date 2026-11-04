# Danh sách màn hình và chức năng — Ứng dụng quản lý thu chi PWA

> Ngày tổng hợp: 22/10/2026  
> Nguồn: `requirements/quan-ly-thu-chi-requirements.md`, `specifications/quan-ly-thu-chi-project-specification.md`, `design/quan-ly-thu-chi-system-design.md`.  
> **Trạng thái:** Đề xuất phân rã UI/UX từ yêu cầu nghiệp vụ đã xác nhận. **21 màn hình/khu vực** không phải 21 trang độc lập bắt buộc; một số có thể là bottom sheet, modal hoặc tab. Mã SCR do tài liệu này đặt để quản lý thiết kế, không thay thế mã FR.  
> Phạm vi: PWA trên iPhone, React + TypeScript, offline IndexedDB, đồng bộ dữ liệu với hệ thống trung tâm khi có mạng, sao lưu mã hóa có phiên bản lên Google Drive của Super Admin.

## 1. Thống kê

| Hạng mục | Số lượng |
|---|---:|
| Màn hình/khu vực đề xuất | **21** |
| Màn hình chung (Admin và User, theo quyền dữ liệu) | **17** |
| Màn hình dành cho Super Admin | **4** |
| Nhóm chức năng | **5** |
| Vai trò | **2** — Super Admin và User |

**Quyền cơ bản:** User chỉ xem/sửa dữ liệu tài chính của mình. Super Admin quản trị tài khoản và có quyền xem/thêm/sửa/xóa dữ liệu tài chính của mọi tài khoản. Mọi quyền nhạy cảm phải được kiểm tra ở API phía server, không chỉ ẩn nút trên UI.

## 2. Danh sách tổng hợp

| ID | Màn hình/khu vực | Vai trò | Ưu tiên | FR liên quan |
|---|---|---|---|---|
| SCR-01 | Đăng nhập | Cả hai | Cốt lõi | FR-22, FR-24 |
| SCR-02 | Dashboard | Cả hai | Cốt lõi | FR-09 |
| SCR-03 | Danh sách giao dịch | Cả hai | Cốt lõi | FR-01–03 |
| SCR-04 | Thêm/Sửa giao dịch | Cả hai | Cốt lõi | FR-01–03 |
| SCR-05 | Quét hóa đơn | Cả hai | Trung bình | FR-19–20 |
| SCR-06 | Quản lý ví và tài khoản | Cả hai | Cốt lõi | FR-05 |
| SCR-07 | Chuyển tiền giữa ví | Cả hai | Cốt lõi | FR-06 |
| SCR-08 | Quản lý danh mục | Cả hai | Cốt lõi | FR-04 |
| SCR-09 | Quản lý ngân sách | Cả hai | Cốt lõi | FR-07–08 |
| SCR-10 | Báo cáo thống kê | Cả hai | Cao | FR-14–15 |
| SCR-11 | Mục tiêu tiết kiệm | Cả hai | Cao | FR-13, FR-16 |
| SCR-12 | Giao dịch định kỳ | Cả hai | Cao | FR-12, FR-17 |
| SCR-13 | Tìm kiếm nâng cao | Cả hai | Cao | FR-18 |
| SCR-14 | Xuất báo cáo PDF | Cả hai | Trung bình | FR-21 |
| SCR-15 | Trung tâm thông báo | Cả hai | Cốt lõi (đề xuất UI) | FR-08, FR-10–13 |
| SCR-16 | Sao lưu và đồng bộ | Cả hai | Cốt lõi | FR-25, FR-31–35, FR-37 |
| SCR-17 | Cài đặt và bảo mật | Cả hai | Cốt lõi | FR-22, FR-24, NFR |
| SCR-18 | Quản lý người dùng | Super Admin | Cốt lõi | FR-26–29 |
| SCR-19 | Tạo/Chỉnh sửa tài khoản | Super Admin | Cốt lõi (đề xuất UI) | FR-26–27 |
| SCR-20 | Quản lý tài chính theo User | Super Admin | Cốt lõi | FR-28, FR-30, FR-33–36 |
| SCR-21 | Nhật ký quản trị | Super Admin | Cốt lõi (đề xuất UI) | FR-29 |

*Chú ý:* Mức ưu tiên của các chức năng đã chốt được giữ theo đặc tả; mức ưu tiên đối với một **màn hình riêng** là gợi ý phục vụ lập kế hoạch UI, nhất là SCR-15, SCR-19 và SCR-21.

## 3. Chức năng chi tiết theo màn hình

### SCR-01 — Đăng nhập
- Nhập username và password, thông báo đăng nhập thất bại, tạo phiên khi hợp lệ.
- Hỗ trợ chuyển tài khoản/đăng xuất bảo đảm không lộ dữ liệu và khóa của tài khoản cũ.
- Sign in with Apple **chỉ là lựa chọn bổ sung còn phụ thuộc điều kiện triển khai**, không thay thế username/password.
- WebAuthn/passkey được chọn để bảo vệ truy cập; UX đăng ký và khôi phục passkey cần thiết kế/kiểm chứng.

### SCR-02 — Dashboard
- Hiển thị tổng số dư các ví; tổng thu và chi tháng này.
- Ngân sách còn lại, tỷ lệ đã dùng; giao dịch gần nhất; biểu đồ chi tiêu nhanh.
- Hóa đơn sắp đến hạn và tiến độ tiết kiệm.
- Dữ liệu của tài khoản đang xem phải được hiển thị rõ ràng; Super Admin có thể chuyển ngữ cảnh tài khoản tại SCR-20.

### SCR-03 — Danh sách giao dịch
- Danh sách giao dịch thu, chi và các thao tác mở chi tiết/sửa/xóa.
- Hoàn tác xóa trong vòng 10 giây.
- Có lối vào bộ lọc/tìm kiếm nâng cao (SCR-13) và tạo giao dịch (SCR-04).

### SCR-04 — Thêm/Sửa giao dịch
- Chọn loại thu/chi, nhập số tiền VND (số nguyên), danh mục, ngày giờ, ví/tài khoản, ghi chú và nhãn tùy chỉnh.
- Cho phép chỉnh sửa giao dịch cũ; lưu vào IndexedDB khi offline, đồng bộ sau.
- Lối vào quét hóa đơn (SCR-05), kết quả quét phải được kiểm tra trước khi lưu.
- Tối ưu tốc độ nhập liệu là mục tiêu; số thao tác/giây nghiệm thu **chưa chốt**.

### SCR-05 — Quét hóa đơn
- Chụp/chọn hình hóa đơn, nhận dạng và gợi ý số tiền, ngày, nội dung gần đúng.
- Cho phép người dùng kiểm tra/sửa thông tin nhận dạng rồi xác nhận vào SCR-04.
- Không tự tạo giao dịch chỉ dựa trên OCR; cách xử lý lỗi OCR chi tiết **chưa chốt**.

### SCR-06 — Quản lý ví và tài khoản
- Danh sách nhiều ví/tài khoản, tên và số dư từng ví; có số dư ban đầu.
- Xem/thêm/sửa ví; không xóa ví đang có giao dịch liên quan.
- Cho phép số dư âm theo quyết định kỹ thuật đã xác nhận.

### SCR-07 — Chuyển tiền giữa ví
- Chọn ví nguồn, ví nhận, số tiền và xác nhận chuyển.
- Cập nhật số dư của cả hai ví; **không tính vào tổng thu hoặc tổng chi**.
- Cần bảo đảm giao dịch chuyển tiền không được đồng bộ nửa chừng.

### SCR-08 — Quản lý danh mục
- Danh sách danh mục thu/chi mặc định.
- Thêm, sửa, xóa danh mục tự tạo; chặn xóa danh mục đang có giao dịch liên quan.

### SCR-09 — Quản lý ngân sách
- Thiết lập ngân sách tổng tháng và ngân sách theo từng danh mục.
- Hiển thị mức đã dùng, còn lại và cảnh báo tại 80%, đạt/vượt 100%.
- Chống gửi trùng một mốc cảnh báo trong cùng kỳ theo quyết định kỹ thuật.

### SCR-10 — Báo cáo thống kê
- Biểu đồ tròn cơ cấu chi tiêu theo danh mục.
- Biểu đồ cột/đường theo ngày, tuần, tháng; so sánh thu chi giữa các tháng.
- Thống kê theo ví/tài khoản và so sánh thực chi với ngân sách.
- Dữ liệu theo lịch/múi giờ thiết bị.

### SCR-11 — Mục tiêu tiết kiệm
- Danh sách nhiều mục tiêu: số tiền đích, hạn hoàn thành và tiến độ.
- Chủ động ghi nhận khoản tiền đóng góp; không tự chuyển tiền vào mục tiêu.
- Thông báo mốc 25%, 50%, 75%, 100%, gần hạn và tổng kết tuần; định nghĩa cụ thể “gần hạn” và giờ tổng kết tuần **chưa chốt**.

### SCR-12 — Giao dịch định kỳ
- Tạo/xem các khoản định kỳ ngày/tuần/tháng.
- Nhắc trước hạn 1 ngày và đúng ngày đến hạn.
- Chỉ ghi giao dịch tài chính sau khi người dùng xác nhận thanh toán.

### SCR-13 — Tìm kiếm nâng cao
- Tìm kiếm/lọc theo thời gian, danh mục, ví, số tiền, nhãn và từ khóa.
- Từ kết quả tìm kiếm có thể mở giao dịch tương ứng.

### SCR-14 — Xuất báo cáo PDF
- Chọn khoảng thời gian/dữ liệu được xuất và tạo PDF.
- PDF bao gồm khoảng thời gian, tổng thu/chi, biểu đồ và danh sách giao dịch theo quyết định kỹ thuật đã chốt.

### SCR-15 — Trung tâm thông báo *(màn hình riêng là đề xuất UI)*
- Điểm tập trung xem nhắc 21:00, cảnh báo ngân sách, thanh toán định kỳ và mốc tiết kiệm.
- Web Push qua Workers/scheduler là quyết định kỹ thuật; quyền thông báo và giới hạn PWA trên iPhone cần được xử lý.
- Vào 21:00 khi app không hoạt động, thông báo **nhắc mở app xem tổng kết chính xác**, không giả định tính toán mới khi app đóng.

### SCR-16 — Sao lưu và đồng bộ
- Hiển thị trạng thái dữ liệu cục bộ: chưa đồng bộ, đang đồng bộ, hoàn tất, lỗi.
- Dữ liệu online đồng bộ hai chiều IndexedDB ↔ Workers/D1; thay đổi của Admin đến iPhone User ở lần đồng bộ tiếp theo.
- Sao lưu archive mã hóa, có phiên bản, theo từng chủ sở hữu lên **Google Drive của Super Admin**.
- Khôi phục yêu cầu xác nhận; dùng khóa khôi phục riêng. Cách phát hành/chia sẻ khóa và lịch giữ các phiên bản **chưa chốt**.

### SCR-17 — Cài đặt và bảo mật
- Hiển thị thông tin tài khoản đang đăng nhập, đăng xuất.
- Quản lý lựa chọn bảo vệ bằng WebAuthn/passkey và các quyền thông báo có liên quan.
- Giao diện ưu tiên phong cách iPhone tối giản; không mặc nhiên thêm các tùy chọn cấu hình chưa được xác nhận.

### SCR-18 — Quản lý người dùng (Super Admin)
- Xem tài khoản đã được tạo, vai trò và trạng thái quản trị.
- Super Admin tạo/quản trị tài khoản; User không thể truy cập API quản trị.
- Thao tác khóa, xóa tài khoản hay đặt lại mật khẩu ở mức quy trình chi tiết cần được chốt trước khi thực thi.

### SCR-19 — Tạo/Chỉnh sửa tài khoản (Super Admin; có thể là form/modal)
- Tạo tài khoản User với username/password.
- Kiểm tra dữ liệu biểu mẫu và quyền quản trị qua backend.
- Form chỉnh sửa tài khoản là đề xuất UI; trường nào cho phép sửa và cách reset password **chưa chốt chi tiết**.

### SCR-20 — Quản lý tài chính theo User (Super Admin)
- Chọn tài khoản đích và xem dữ liệu tài chính mới nhất **đã đồng bộ** của tài khoản đó.
- Xem/thêm/sửa/xóa giao dịch, ví, ngân sách và dữ liệu tài chính thuộc tài khoản được chọn theo quyền Super Admin.
- Mỗi thao tác hiển thị rõ chủ sở hữu và được audit phía server.
- Dữ liệu offline chưa đồng bộ từ thiết bị của User sẽ chưa xuất hiện ở màn hình này.

### SCR-21 — Nhật ký quản trị (Super Admin; màn hình riêng là đề xuất UI)
- Xem thao tác quản trị xuyên tài khoản gồm người thực hiện, tài khoản đích, hành động và thời điểm.
- Nhật ký phải do server tạo và kiểm soát; định dạng/bộ lọc UI cụ thể có thể quyết định khi thiết kế.

## 4. Cấu trúc điều hướng iPhone đề xuất

Năm tab chính (chưa chốt UI): **Trang chủ · Thu chi · Báo cáo · Ví · Khác**. Tạo giao dịch có thể là hành động nổi bật từ Trang chủ hoặc Thu chi; các màn hình chỉnh sửa có thể dùng sheet/modal. Tab **Khác** chứa ngân sách, tiết kiệm, định kỳ, sao lưu, bảo mật; riêng Super Admin có mục quản trị tài khoản và tài chính người dùng.

## 5. Phân kỳ phát triển

- **Giai đoạn cốt lõi:** đăng nhập và RBAC, dashboard, thu chi, danh mục, ví/chuyển tiền, ngân sách, thông báo cơ bản, offline/sync, sao lưu tập trung, quản trị tài khoản và quyền Super Admin.
- **Giai đoạn ưu tiên cao:** báo cáo, tìm kiếm nâng cao, tiết kiệm, giao dịch định kỳ và các thông báo liên quan.
- **Giai đoạn ưu tiên trung bình:** OCR hóa đơn, xuất PDF.

## 6. Những điểm cần chốt trước khi triển khai toàn bộ

1. Cách xử lý xung đột khi User sửa offline và Super Admin sửa cùng bản ghi trên server (không tự chọn “ai thắng”).
2. Lịch sao lưu, số phiên bản giữ lại, quyền và quy trình khôi phục khóa giải mã cho nhiều tài khoản.
3. Quy trình tạo Super Admin đầu tiên, đổi/quên mật khẩu và khôi phục tài khoản.
4. Tiêu chí đo việc nhập giao dịch nhanh; chuyển dữ liệu từ Sổ Thu Chi MISA nếu cần.
5. Thời điểm thông báo “gần hạn” tiết kiệm, lịch tổng kết tuần và cách xử lý lỗi OCR.
6. Các giới hạn Apple ID trên web, WebAuthn/passkey và độ tin cậy Web Push trên PWA iOS.

---

**Nguyên tắc:** Tài liệu này là *screen inventory* phục vụ UI/UX. Không đồng nghĩa tất cả màn hình hoặc hành vi chi tiết chưa chốt đã được phê duyệt. Khi thiết kế mockup, bám yêu cầu đã xác nhận và đánh dấu nội dung suy ra từ kiến trúc như đề xuất.
