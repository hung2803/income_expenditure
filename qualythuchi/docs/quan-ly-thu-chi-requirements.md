# Ứng dụng quản lý thu chi — Danh sách yêu cầu

> Hạt giống ban đầu: "tôi muốn thiết kế 1 app quản lý thu chi và có thông báo hàng ngày tiện nghi đầy đủ chức năng hãy phỏng vấn tôi bằng skill tôi gửi"
> Trạng thái: Hoàn tất — 2026-10-22

## 1. Tổng quan
- Bối cảnh: Người dùng hiện sử dụng Sổ Thu Chi MISA; việc nhập liệu chưa nhanh và tiện.
- Mục tiêu: Thiết kế ứng dụng quản lý thu chi cá nhân trên iPhone, có thông báo hằng ngày, hỗ trợ ghi chép nhanh và theo dõi tài chính cá nhân dễ sử dụng.

## 2. Phạm vi
- Trong phạm vi: Ghi chép thu chi; ngân sách và cảnh báo vượt mức; biểu đồ, báo cáo và thống kê; thông báo tổng kết hằng ngày; mục tiêu tiết kiệm; quản lý ví, tài khoản và số dư; giao dịch định kỳ và nhắc thanh toán; tìm kiếm và xuất dữ liệu.

- Ngân sách: Có ngân sách tổng tháng và ngân sách riêng cho từng danh mục.
- Tiết kiệm: Có nhiều mục tiêu, mỗi mục tiêu có số tiền đích và hạn hoàn thành.
- Dashboard: Tổng số dư tất cả các ví, tổng thu và tổng chi tháng này, ngân sách còn lại và tỷ lệ đã sử dụng, giao dịch gần nhất, biểu đồ chi tiêu nhanh, hóa đơn sắp đến hạn, tiến độ tiết kiệm.
- Báo cáo: Chi tiêu theo danh mục; thu chi theo ngày, tuần, tháng; so sánh giữa các tháng; thống kê theo ví/tài khoản; thực tế so với ngân sách.
- Tìm kiếm và lọc: Theo thời gian, danh mục, ví, số tiền, nhãn và từ khóa.
- Xuất dữ liệu: PDF.
- Ngoài phạm vi phiên bản đầu: Đồng bộ ngân hàng tự động, **chia sẻ dữ liệu thu chi giữa các tài khoản**, ứng dụng Android (PWA iPhone được triển khai qua web).
- Tiến độ: Phát triển theo từng giai đoạn; chưa đặt hạn chót.
- Thứ tự ưu tiên: Cốt lõi — giao dịch, ví, danh mục, ngân sách, thông báo; Cao — báo cáo, định kỳ, tiết kiệm, tìm kiếm; Trung bình — quét hóa đơn, xuất PDF. Các yêu cầu bảo mật, hoạt động offline và sao lưu Google Drive vẫn được giữ.

## 3. Người dùng và phân quyền
- Người sử dụng: 2–3 người dùng có tài khoản riêng (điều chỉnh ngày 22/10/2026).
- Mỗi người đăng nhập bằng **username và password**; mỗi người chỉ được xem, nhập, sửa, xóa, báo cáo và sao lưu/khôi phục dữ liệu của chính mình. Không chia sẻ sổ thu chi giữa các tài khoản.
- Phương thức Sign in with Apple đã được người dùng lựa chọn trước đó: giữ là phương thức bổ sung mong muốn, nhưng **không coi là sẵn sàng miễn phí** khi chưa đáp ứng điều kiện Apple Developer; username/password là luồng bắt buộc.
- Cấp tài khoản: **chỉ Admin được tạo tài khoản người dùng mới** (đã xác nhận). Đặt lại mật khẩu và quy trình khôi phục tài khoản: chưa được xác nhận.

## 4. Luồng nghiệp vụ chính
### Ghi giao dịch
1. Người dùng nhập thủ công thông tin giao dịch hoặc quét hóa đơn để hỗ trợ nhập giao dịch.
2. Thông tin giao dịch cần lưu gồm số tiền, danh mục thu/chi, ngày và giờ, ví/tài khoản, ghi chú, nhãn tùy chỉnh.
3. Khi quét hóa đơn, hệ thống hỗ trợ nhận diện số tiền, ngày và nội dung gần đúng; người dùng kiểm tra/xác nhận trước khi lưu.
4. Người dùng được sửa, xóa giao dịch và hoàn tác thao tác xóa trong 10 giây sau khi xóa; không cần lịch sử chỉnh sửa chi tiết.

### Quản lý danh mục
1. Ứng dụng cung cấp các danh mục thu chi mặc định; người dùng có thể thêm, sửa và xóa danh mục.

### Chuyển tiền giữa các ví
1. Người dùng thực hiện chuyển tiền giữa các ví/tài khoản.
2. Hệ thống không tính giao dịch chuyển tiền là khoản thu hoặc chi.


### Giao dịch định kỳ và nhắc thanh toán
1. Trước hạn thanh toán 1 ngày và vào đúng ngày đến hạn, hệ thống gửi thông báo nhắc thanh toán.
2. Khi đến kỳ, hệ thống gửi thông báo và chỉ ghi giao dịch sau khi người dùng xác nhận.

### Theo dõi tiết kiệm
1. Hệ thống thông báo khi mục tiêu đạt mốc 25%, 50%, 75%, 100% và khi gần hạn hoàn thành.
2. Hệ thống gửi tổng kết tiến độ tiết kiệm hằng tuần.

### Theo dõi ngân sách và thông báo
1. Người dùng theo dõi ngân sách tổng tháng và ngân sách theo từng danh mục.
2. Hệ thống cảnh báo khi sử dụng 80% ngân sách và khi đạt hoặc vượt 100% ngân sách.
3. Nếu trong ngày chưa nhập giao dịch, hệ thống nhắc ghi thu chi.
4. Hệ thống gửi tổng kết thu chi và nhắc ghi giao dịch (nếu chưa nhập trong ngày) lúc 21:00; gửi nhắc thanh toán hóa đơn/khoản định kỳ và thông báo tiến độ tiết kiệm.

### Xem dashboard và báo cáo
1. Khi mở trang chủ, người dùng xem tổng số dư tất cả các ví, thu và chi tháng này, ngân sách còn lại và tỷ lệ sử dụng, giao dịch gần nhất, biểu đồ chi tiêu nhanh, hóa đơn sắp đến hạn và tiến độ tiết kiệm.
2. Người dùng xem báo cáo chi tiêu theo danh mục bằng biểu đồ tròn; theo ngày/tuần/tháng bằng biểu đồ cột hoặc đường; so sánh thu chi giữa các tháng; thống kê theo từng ví/tài khoản; và chi tiêu thực tế so với ngân sách.
3. Người dùng tìm kiếm giao dịch theo thời gian, danh mục, ví, số tiền, nhãn và từ khóa, đồng thời xuất dữ liệu dạng PDF.

## 5. Yêu cầu chức năng
| Nhóm | Yêu cầu | Ưu tiên |
|---|---|---|
| Giao dịch | Người dùng nhập thủ công khoản thu/chi. | Cốt lõi |
| Quét hóa đơn | Người dùng quét hóa đơn để hỗ trợ nhập giao dịch. | Trung bình |
| Giao dịch | Người dùng lưu số tiền, danh mục, thời gian, ví/tài khoản, ghi chú và nhãn tùy chỉnh cho giao dịch. | Cốt lõi |
| Giao dịch | Khi quét hóa đơn, hệ thống gợi ý số tiền, ngày và nội dung gần đúng để người dùng xác nhận trước khi lưu. | Trung bình |
| Giao dịch | Người dùng sửa, xóa và hoàn tác xóa giao dịch trong 10 giây. | Cốt lõi |
| Danh mục | Hệ thống cung cấp danh mục thu/chi mặc định; người dùng thêm, sửa, xóa danh mục. | Cốt lõi |
| Ngân sách | Người dùng đặt ngân sách tổng tháng và riêng cho từng danh mục. | Cốt lõi |
| Ngân sách | Hệ thống cảnh báo ở mốc sử dụng 80% và đạt/vượt 100% ngân sách. | Cốt lõi |
| Dashboard | Người dùng xem tổng số dư các ví, thu chi tháng, ngân sách còn lại và tỷ lệ sử dụng, giao dịch gần nhất, biểu đồ nhanh, hóa đơn sắp đến hạn, tiến độ tiết kiệm. | Cốt lõi |
| Báo cáo | Người dùng xem biểu đồ tròn chi tiêu theo danh mục và biểu đồ cột/đường thu chi theo ngày, tuần, tháng. | Cao |
| Báo cáo | Người dùng so sánh thu chi giữa các tháng, thống kê từng ví/tài khoản và so sánh chi tiêu thực tế với ngân sách. | Cao |
| Thông báo | Người dùng nhận tổng kết thu chi cuối ngày lúc 21:00. | Cốt lõi |
| Thông báo | Hệ thống nhắc ghi thu chi lúc 21:00 nếu trong ngày chưa có giao dịch được nhập. | Cốt lõi |
| Thông báo | Hệ thống nhắc thanh toán hóa đơn/khoản định kỳ trước hạn 1 ngày và vào ngày đến hạn. | Cốt lõi |
| Thông báo | Hệ thống thông báo tiến độ tiết kiệm tại các mốc 25%, 50%, 75%, 100%, khi gần hạn và tổng kết hằng tuần. | Cốt lõi |
| Tiết kiệm | Người dùng quản lý nhiều mục tiêu với số tiền đích và hạn hoàn thành. | Cao |
| Ví/tài khoản | Người dùng quản lý nhiều ví, tài khoản và số dư. | Cốt lõi |
| Ví/tài khoản | Người dùng chuyển tiền giữa các ví mà không ghi nhận là thu/chi. | Cốt lõi |
| Định kỳ | Khi tới kỳ, hệ thống nhắc người dùng xác nhận thanh toán và chỉ ghi giao dịch sau khi được xác nhận. | Cao |
| Tra cứu | Người dùng tìm kiếm và lọc giao dịch theo thời gian, danh mục, ví, số tiền, nhãn và từ khóa. | Cao |
| Xuất dữ liệu | Người dùng xuất dữ liệu tài chính dưới dạng PDF. | Trung bình |

## 6. Dữ liệu chính
| Đối tượng | Thông tin quan trọng | Ghi chú |
|---|---|---|
| Giao dịch | Số tiền, danh mục thu/chi, ngày và giờ, ví/tài khoản, ghi chú, nhãn tùy chỉnh | Có nhập thủ công, quét hóa đơn hỗ trợ điền thông tin và xác nhận trước lưu |
| Danh mục | Danh mục thu/chi mặc định và danh mục tự quản lý | Cho phép thêm, sửa, xóa |
| Ví/tài khoản | Nhiều ví và tài khoản | Có quản lý số dư |


| Ngân sách | Ngân sách tổng tháng; ngân sách theo danh mục | Có ngưỡng cảnh báo 80%, 100% |
| Mục tiêu tiết kiệm | Số tiền đích, hạn hoàn thành | Cho phép nhiều mục tiêu |

| Dữ liệu báo cáo | Thu, chi theo thời gian, danh mục, ví; sử dụng ngân sách | Hiển thị trên dashboard và báo cáo |

## 7. Quy tắc nghiệp vụ
- Chuyển tiền giữa các ví/tài khoản không được tính vào tổng thu hoặc tổng chi.
- Kết quả nhận diện hóa đơn phải được người dùng kiểm tra và xác nhận trước khi lưu giao dịch.
- Có thể hoàn tác xóa giao dịch trong 10 giây kể từ thao tác xóa.
- Cảnh báo ngân sách tại mức 80% và khi đạt hoặc vượt 100%.
- Nhắc ghi thu chi nếu trong ngày người dùng chưa nhập giao dịch, vào 21:00.
- Tổng kết thu chi hằng ngày vào 21:00.
- Nhắc thanh toán trước hạn 1 ngày và vào ngày đến hạn.
- Giao dịch định kỳ chỉ được ghi sau khi người dùng xác nhận.
- Thông báo tiết kiệm khi đạt 25%, 50%, 75%, 100%, khi gần hạn và tổng kết tiến độ hằng tuần.


## 8. Yêu cầu phi chức năng
- Giao diện theo phong cách iOS hiện đại, tối giản, dễ sử dụng.
- Ứng dụng cần hỗ trợ sử dụng offline.
- Dữ liệu làm việc được lưu cục bộ trên iPhone để ứng dụng hoạt động offline; Google Drive là nơi sao lưu chính khi có kết nối Internet.
- Nhu cầu bảo vệ truy cập bằng Face ID hoặc mật mã thiết bị được giữ nguyên; **PWA không có LocalAuthentication native**, phương án WebAuthn/passkey và màn hình khóa cần được kiểm chứng/chốt.

## 9. Nền tảng, công nghệ và tích hợp
- Nền tảng sử dụng: iPhone iOS 26 trở lên, dưới dạng **PWA cài từ Safari lên màn hình chính**; phát triển trên Windows, không qua App Store.
- Đăng nhập **username/password bắt buộc** cho 2–3 tài khoản riêng biệt; yêu cầu bổ sung hỗ trợ **Apple ID** vẫn được giữ dưới dạng phương thức phụ thuộc điều kiện Apple Developer; không được thay thế username/password bằng chỉ Apple ID.
- Bảo vệ truy cập: giữ nhu cầu Face ID/mật mã; **WebAuthn/passkey không tương đương hoàn toàn API Face ID native**.
- Lưu trữ: Dữ liệu cục bộ trên iPhone phục vụ thao tác offline; sao lưu lên Google Drive là phương án chính khi có mạng. Đây là cơ chế sao lưu, không mặc định đồng bộ giao dịch tức thời hoặc nhiều thiết bị.

## 10. Câu hỏi chưa trả lời
- Tiêu chí thành công đo được của bản đầu là gì (ví dụ thời gian nhập 1 giao dịch)? — ảnh hưởng: nghiệm thu trải nghiệm nhập nhanh.
- Có cần chuyển dữ liệu lịch sử từ Sổ Thu Chi MISA sang ứng dụng mới không? — ảnh hưởng: nhập dữ liệu ban đầu.
- “Gần hạn” mục tiêu tiết kiệm là trước bao nhiêu ngày, và tổng kết tuần gửi vào ngày/giờ nào? — ảnh hưởng: lịch thông báo.
- Khi quét hóa đơn, nếu không nhận diện được hoặc thông tin sai thì ứng dụng cần xử lý chi tiết ra sao? — ảnh hưởng: ngoại lệ của luồng quét.
- Lịch/kích hoạt sao lưu Google Drive, số phiên bản lưu giữ và cách người dùng khôi phục bản sao lưu được thực hiện như thế nào? — ảnh hưởng: sao lưu, khôi phục và nghiệm thu.

## Nhật ký phỏng vấn
- Vòng 1: Xác nhận ứng dụng chỉ dành cho bản thân, trên iOS, hiện đang dùng ứng dụng khác, và chọn 8 nhóm chức năng kể trên.
- Vòng 2: Xác nhận nhập thủ công và quét hóa đơn; nhiều ví/tài khoản; sáu trường thông tin giao dịch; chuyển tiền giữa các ví không tính thu/chi.
- Vòng 3: Xác nhận ngân sách tổng tháng và theo danh mục; cảnh báo 80% và 100%; nhắc khi chưa ghi giao dịch; nhiều mục tiêu tiết kiệm có số tiền đích và hạn; thông báo tổng kết cuối ngày, nhắc ghi chép, nhắc hóa đơn định kỳ và tiến độ tiết kiệm.
- Vòng 4: Xác nhận giờ tổng kết và nhắc ghi thu chi 21:00; nhắc hóa đơn trước hạn 1 ngày và đúng ngày; chỉ ghi giao dịch định kỳ khi người dùng xác nhận; thông báo tiết kiệm theo mốc 25%, 50%, 75%, 100%, khi gần hạn và tổng kết hằng tuần.
- Vòng 5: Xác nhận 7 thành phần dashboard; 5 nhóm báo cáo (danh mục, thời gian, so sánh tháng, ví, ngân sách); tìm kiếm và lọc theo 6 tiêu chí; chỉ xuất PDF.
- Vòng 6: Xác nhận giao diện iOS hiện đại, tối giản, dễ sử dụng; đăng nhập bằng Apple ID; bảo mật bằng Face ID hoặc mật mã thiết bị; dùng offline và đồng bộ/sao lưu iCloud khi có mạng.
- Vòng 7: Xác nhận danh mục mặc định có thể thêm/sửa/xóa; quét hóa đơn nhận diện số tiền, ngày, nội dung và yêu cầu xác nhận; cho phép sửa/xóa/hoàn tác xóa; bản đầu không có đồng bộ ngân hàng tự động, chia sẻ dữ liệu, Web/Android.
- Vòng 8: Xác nhận mức ưu tiên Cốt lõi/Cao/Trung bình; hiện dùng Sổ Thu Chi MISA, muốn nhập liệu nhanh và tiện hơn; hoàn tác xóa trong 10 giây; phát triển theo giai đoạn, chưa có hạn chót.

## Nhật ký thay đổi sau phỏng vấn
- 2026-10-22: Người dùng thay phương án iCloud bằng **Google Drive làm nơi sao lưu chính**, vẫn **lưu dữ liệu cục bộ trên iPhone để sử dụng offline**. Không xác nhận đồng bộ thời gian thực, sao lưu bao lâu một lần, số phiên bản hay phương án khôi phục; các chi tiết này để câu hỏi mở. Các chức năng khác không đổi.


## Phụ lục A. Công nghệ cho phương án PWA trên Windows

**Lịch sử thay đổi 22/10/2026:** Người dùng phê duyệt thay thế nền tảng triển khai SwiftUI/native bằng React + TypeScript + PWA để tự phát triển trên Windows và cài trên iPhone không cần App Store hay phí Apple Developer. Các lựa chọn ở mức thư viện dưới đây là đề xuất triển khai; không được hiểu là đã kiểm chứng tất cả API trên Safari iOS.

| Lớp | Công nghệ / phương án | Tình trạng |
|---|---|---|
| Môi trường | Windows, Node.js LTS, VS Code, Git | Định hướng đã chốt: phát triển không cần macOS |
| Ứng dụng | React + TypeScript + Vite + PWA | Kiến trúc triển khai đã được chấp thuận |
| UI | Tailwind CSS + shadcn/ui + lucide-react | Đề xuất thư viện |
| Trạng thái, biểu mẫu | Zustand; React Hook Form + Zod | Đề xuất |
| Dữ liệu offline | IndexedDB + Dexie.js | Đề xuất kỹ thuật đáp ứng offline |
| Offline assets | vite-plugin-pwa + Workbox/service worker | Đề xuất |
| Biểu đồ | Recharts | Đề xuất |
| OCR hóa đơn | Camera web + Tesseract.js | Đề xuất, cần đo độ chính xác tiếng Việt trên iPhone |
| PDF | pdf-lib; thư viện dựng biểu đồ ra ảnh | Đề xuất |
| Backup | Google Drive REST API, `appDataFolder`, OAuth 2.0 PKCE | Giữ TD-06; tích hợp trình duyệt cần kiểm chứng |
| Mã hóa archive | Web Crypto API (AES-GCM + cơ chế dẫn xuất khóa) | Giữ TD-07, thiết kế quản lý khóa còn mở |
| Hosting tĩnh HTTPS | Cloudflare Pages Free | Đề xuất; tùy hạn mức dịch vụ |
| Thông báo đúng giờ khi đóng app | Web Push + Service Worker + dịch vụ push có lịch (vd Cloudflare Workers Cron) | **Chưa xác nhận giải pháp**; cần thành phần serverless và lưu subscription |
| Kiểm thử | Vitest + React Testing Library + Playwright + kiểm thử iPhone thật | Đề xuất |

**Luồng lưu trữ:** React PWA → Domain/Repository → IndexedDB trên iPhone; nếu có Internet và người dùng cấp quyền, ứng dụng tạo archive có phiên bản và mã hóa để sao lưu lên Google Drive `appDataFolder`. Không đọc/ghi Google Drive thay cho database giao dịch trực tuyến.

**Ranh giới quan trọng:** PWA không bảo đảm JavaScript chạy lúc 21:00 khi đóng app. TD-05 về *nội dung* nhắc mở app vẫn có hiệu lực, nhưng để *gửi* thông báo ngoài app phải có Web Push và dịch vụ phát theo lịch; chưa quyết định hạ tầng phụ trợ và chính sách dữ liệu. Google Drive API không phải máy chủ push. IndexedDB có nguy cơ bị xóa khi xóa dữ liệu trang web / app; phải kiểm thử khôi phục.

**Cần xác nhận bổ sung:** Web Apple ID (điều kiện/cấu hình/chi phí), phương án mở khóa bằng passkey/WebAuthn, dịch vụ Web Push lúc 21:00, hỗ trợ nền của Google OAuth và sao lưu theo lịch. Giữ nguyên OQ-01 đến OQ-05.

**Tham khảo:** https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers ; https://developers.google.com/workspace/drive/api/guides/appdata ; https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iph4f6a5d39d/ios

## Nhật ký cập nhật kiến trúc
- 22/10/2026: Được người dùng chấp thuận phương án PWA trên Windows; giữ Google Drive là nơi sao lưu, dữ liệu local offline; đánh dấu lại đăng nhập Apple ID, bảo mật và push theo khả năng web.

## Phụ lục — Xác nhận PWA-01 đến PWA-04 và thay đổi phạm vi người dùng (22/10/2026)

- **PWA-01:** Người dùng chọn giữ Sign in with Apple cho web và chấp nhận điều kiện triển khai; sau đó **bổ sung bắt buộc đăng nhập bằng username/password** cho 2–3 người khác nhau. Cả hai yêu cầu được giữ; Apple ID chưa được bảo đảm triển khai miễn phí.
- **PWA-02:** WebAuthn/passkey sử dụng xác thực thiết bị iPhone để bảo vệ truy cập; không hứa gọi được Face ID cụ thể trong mọi lần.
- **PWA-03:** Web Push và Cloudflare Workers Cron trong hạn mức miễn phí để nhắc lúc 21:00 khi app đóng (không cam kết đúng từng phút).
- **PWA-04:** IndexedDB lưu offline; Google Drive `appDataFolder` lưu archive mã hóa, có phiên bản, cho phép khôi phục. Bản sao lưu và quyền OAuth phải **tách biệt từng tài khoản người dùng**.
- **Quy tắc cô lập dữ liệu (bắt buộc):** User A không được đọc/sửa/xóa/xuất/sao lưu/khôi phục dữ liệu User B; ngoại lệ có chủ đích: Super Admin có quyền truy cập và quản trị mọi tài khoản theo kiểm tra phía máy chủ. Chuyển tài khoản phải khóa hoặc xóa dữ liệu phiên cục bộ trước khi hiển thị dữ liệu tài khoản khác. Không thể coi lọc giao diện đơn thuần là cơ chế bảo mật.
- **Backend tối thiểu:** Username/password nhiều người yêu cầu dịch vụ xác thực phía server hoặc dịch vụ auth có quản lý; đề xuất Cloudflare Workers + D1 quản lý account, password hash, session/refresh và metadata push. **Không lưu mật khẩu plaintext hoặc xác thực chỉ bằng logic React.** Dữ liệu tài chính tiếp tục offline trong IndexedDB theo người dùng và backup Drive, chưa có đồng bộ dữ liệu tài chính realtime.
- **Câu hỏi mở mới:** Quên mật khẩu/thu hồi phiên xử lý thế nào? Khi offline có thể mở tài khoản đã đăng nhập đến mức nào? Mỗi tài khoản dùng Google Drive riêng hay cùng một Drive nhưng tách thư mục/khóa sao lưu? Apple ID cần ra mắt cùng bản đầu hay tích hợp về sau?

## Phụ lục — RBAC Admin/User (xác nhận 22/10/2026) <!-- RBAC-ADMIN-2026-10-22 -->

- Chỉ **Admin** được tạo tài khoản mới. Không có luồng đăng ký công khai và User không được tạo tài khoản.
- Super Admin có toàn quyền hệ thống, được xem/thêm/sửa/xóa dữ liệu tài chính của tất cả tài khoản; User chỉ quản lý dữ liệu của chính mình. Quyền truy cập bản sao lưu mã hóa cần cơ chế khóa và quyền Google Drive phù hợp, không tự suy ra từ vai trò.
- Super Admin được quản trị tài khoản và cấu hình hệ thống. Cơ chế bootstrap Admin đầu tiên, đặt/cấp mật khẩu, cấp thêm vai trò Super Admin và thu hồi phiên vẫn cần đặc tả chi tiết; không bỏ qua các biện pháp an toàn.

| Hành động | Admin | User |
|---|---|---|
| Đăng nhập bằng tài khoản hợp lệ | Có | Có |
| Tạo tài khoản User mới | Có | Không |
| Tự quản lý thu chi, ví, ngân sách và báo cáo | Có | Có |
| Xem/thêm/sửa/xóa dữ liệu tài chính tài khoản khác | Có (mọi tài khoản) | Không |
| Sao lưu/khôi phục dữ liệu Google Drive của chính mình | Có | Có |
| Sao lưu/khôi phục dữ liệu người khác | Có theo cơ chế cấp quyền Drive/khóa | Không |
| Tự đăng ký tài khoản công khai | Không | Không |

Luồng xác nhận: Admin đăng nhập → vào khu vực quản trị tài khoản → nhập thông tin cấp tài khoản → hệ thống kiểm tra quyền Admin và tạo tài khoản User → tài khoản mới đăng nhập riêng. Trường nhập bắt buộc, cách cấp mật khẩu ban đầu và cách giao thông tin đăng nhập cần làm rõ khi thiết kế chi tiết.


## Phụ lục — Cập nhật quyền Super Admin (xác nhận 22/10/2026) <!-- SUPERADMIN-2026-10-22 -->

**Quyết định mới nhất, thay thế mọi câu phủ định quyền truy cập chéo của Admin trong tài liệu:** Chủ hệ thống là **Super Admin**, có toàn quyền quản trị và **được xem, thêm, sửa, xóa dữ liệu tài chính của bất kỳ tài khoản nào**. User chỉ được truy cập và quản lý dữ liệu của chính mình. Việc ghi nhận và hiển thị giao dịch phải thể hiện đúng tài khoản sở hữu dữ liệu; không gộp số dư các tài khoản trừ khi Super Admin chủ động xem báo cáo toàn hệ thống (chưa xác nhận yêu cầu báo cáo tổng hợp).

| Tác vụ | Super Admin | User |
|---|---|---|
| Đăng nhập và quản lý thu chi cá nhân | Có | Có |
| Tạo tài khoản mới, quản trị người dùng và cấu hình hệ thống | Có | Không |
| Xem/thêm/sửa/xóa giao dịch, ví, danh mục, ngân sách, tiết kiệm của tài khoản khác | Có | Không |
| Xuất dữ liệu tài chính của tài khoản khác | Có | Không |
| Sao lưu/khôi phục dữ liệu tài khoản khác | Quyền nghiệp vụ: Có; triển khai phải có quyền Drive và giải mã hợp lệ | Không |
| Tự đăng ký tài khoản công khai | Không | Không |

**Ràng buộc kỹ thuật phải thực hiện:** Quyền Super Admin cần được xác minh **phía backend** và ghi log các thao tác thay đổi dữ liệu xuyên tài khoản; tuyệt đối không dùng role từ request client như bằng chứng duy nhất. Dữ liệu tài chính hiện **chỉ lưu offline trên thiết bị người dùng và các bản backup mã hóa trên Google Drive**; vì vậy không thể bảo đảm Super Admin đọc/sửa/xóa dữ liệu mới chưa được sao lưu từ thiết bị khác. Để thực hiện quyền này thực tế cần chốt **cơ chế dữ liệu dùng chung/đồng bộ hoặc quyền quản trị trên các bản backup** và **phương án cấp quyền giải mã cho Super Admin**. Không tự động gỡ mã hóa, không lưu khóa khôi phục dạng văn bản thuần trên server.

**Câu hỏi kỹ thuật còn mở:** (1) Super Admin có cần truy cập tức thời dữ liệu chưa sao lưu của người khác hay chỉ dữ liệu đã đồng bộ/sao lưu? (2) Backup ở Google Drive riêng từng người hay Drive quản trị chung? (3) Khóa mã hóa backup được chia sẻ cho Super Admin bằng cơ chế nào? (4) Khi Admin sửa dữ liệu người khác, thay đổi được ghi về thiết bị người đó thế nào? Quyền đã được xác nhận; cơ chế bảo đảm quyền còn chờ chốt.


## Quyết định mới nhất — Google Drive tập trung của Super Admin (22/10/2026)

> **Đã được người dùng xác nhận.** Phần này ghi đè mọi đoạn cũ nói mỗi người sử dụng Google Drive riêng hoặc mỗi User phải tự cấp quyền OAuth Google Drive để sao lưu.

- Tất cả người dùng (dự kiến 2–3 tài khoản) có dữ liệu tài chính riêng trong IndexedDB trên iPhone của mình để hoạt động offline.
- **Tất cả bản sao lưu của mọi tài khoản phải được lưu vào duy nhất Google Drive do Super Admin sở hữu**; không yêu cầu User có hoặc kết nối tài khoản Google Drive riêng.
- Bản sao lưu được mã hóa và có phiên bản; tách biệt rõ theo `ownerUserId` và ID bản sao lưu; User chỉ được sao lưu và khôi phục dữ liệu của bản thân. Super Admin có quyền quản trị sao lưu và dữ liệu mọi tài khoản sau khi xác thực/ủy quyền phù hợp.
- Google Drive là **đích sao lưu**, không mặc nhiên là cơ sở dữ liệu giao dịch realtime. Dữ liệu trên iPhone User chưa tải lên sẽ không xuất hiện trong bản sao lưu Super Admin có thể đọc.
- Không nhúng Google OAuth access token/refresh token hoặc khóa bí mật của Super Admin vào mã React PWA, IndexedDB của User, hay trả chúng về trình duyệt. Mọi truy cập Google Drive chung phải qua API server được kiểm tra session, `ownerUserId` và role.
- Vẫn phải thiết kế cách quản lý khóa mã hóa để Super Admin có thể giải mã hợp lệ bản sao lưu của User mà không lưu khóa khôi phục dạng văn bản thuần trên server.

**Cần thiết kế/chốt tiếp, chưa tự xem là quyết định được phê duyệt:** (1) OAuth Google cấp quyền cho dịch vụ server truy cập Drive của Super Admin, lưu và xoay vòng refresh token an toàn; (2) chính sách cấp khóa giải mã cho Admin và khôi phục khi mất khóa; (3) chu kỳ tự sao lưu, số phiên bản và cơ chế retry; (4) Admin xem dữ liệu đã backup hay cần dữ liệu mới nhất, và nếu Admin sửa dữ liệu User thì đồng bộ ngược thế nào. Các OQ còn mở khác vẫn giữ nguyên.

**Tiêu chí nghiệm thu bổ sung:** User A và User B sao lưu thành công mà không đăng nhập Google riêng; dữ liệu được lưu phân vùng theo tài khoản trên Drive Super Admin; User A không thể đọc, ghi đè hoặc khôi phục bản sao User B ngay cả khi sửa API request; Super Admin có thể liệt kê metadata các bản sao theo từng User.

## Quyết định mới nhất — Đồng bộ tài chính hai chiều <!-- SYNC-2026-10-22 -->

**Đã xác nhận (22/10/2026):** Dữ liệu tài chính được lưu offline riêng trên iPhone bằng IndexedDB và **đồng bộ hai chiều khi có Internet** qua dịch vụ dữ liệu trung tâm. Super Admin có quyền xem/thêm/sửa/xóa dữ liệu mới nhất **đã đồng bộ** của tất cả tài khoản; thay đổi của Admin đồng bộ ngược về iPhone người sở hữu. **Google Drive của Super Admin tiếp tục là đích sao lưu tập trung mã hóa, có phiên bản**, không phải cơ sở dữ liệu đồng bộ trực tiếp.

**Giới hạn:** Dữ liệu mới chỉ lưu ở iPhone đang offline không thể hiện ở Admin cho tới khi đồng bộ thành công; thay đổi Admin cũng chỉ đến iPhone User sau khi thiết bị kết nối lại.

- Mỗi tài khoản chỉ được đọc/ghi dữ liệu của mình; Super Admin có quyền truy cập mọi tài khoản và thao tác xuyên tài khoản theo xác thực phía backend.
- Khi offline, thao tác được giữ trong IndexedDB và sẽ gửi lên hệ thống trung tâm khi có mạng; đồng bộ hai chiều bao gồm các chỉnh sửa Admin thực hiện cho tài khoản User.
- Google Drive của Super Admin vẫn là nơi chứa mọi bản backup theo `ownerUserId`; User không phải kết nối Google Drive cá nhân.
- Cần hiển thị trạng thái dữ liệu chờ đồng bộ/lỗi đồng bộ cho người dùng.
- **Chưa chốt:** cách giải quyết xung đột chỉnh sửa cùng bản ghi, tần suất đồng bộ, lịch/giữ phiên bản backup, chia sẻ khóa khôi phục và phương án phục hồi khi lỗi mạng.

**Thứ tự ưu tiên tài liệu:** Mục này thay thế các đoạn lịch sử nói D1 không lưu dữ liệu tài chính hoặc Admin chỉ xem snapshot từ bản sao Drive. Yêu cầu khác giữ nguyên.
