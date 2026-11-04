# PROJECT SPECIFICATION — Quản lý thu chi cá nhân (PWA trên iPhone)

> **Phiên bản tài liệu:** 1.0 — 22/10/2026  
> **Trạng thái:** Đặc tả dựa trên yêu cầu đã xác nhận; còn 5 câu hỏi cần làm rõ  
> **Nguồn yêu cầu nghiệp vụ:** `requirements/quan-ly-thu-chi-requirements.md` (phỏng vấn 8 vòng, chốt ngày 22/10/2026); phụ lục công nghệ là **đề xuất triển khai**, không phải yêu cầu nghiệp vụ đã chốt.  
> **Nguyên tắc:** Không tự bổ sung chức năng, thời hạn, công thức, tiêu chí đo hoặc hành vi chưa được xác nhận. Kiến trúc/công nghệ chỉ nêu ở **phụ lục đề xuất**, tách khỏi các yêu cầu đã xác nhận.

## 1. Tổng quan và mục tiêu

### 1.1 Bối cảnh
- Người dùng đang sử dụng **Sổ Thu Chi MISA** nhưng thấy thao tác nhập liệu chưa nhanh và tiện.
- Sản phẩm mới phục vụ **2–3 người dùng, mỗi người một tài khoản và dữ liệu cá nhân riêng** trên **iPhone (iOS)**.

### 1.2 Mục tiêu đã xác nhận
- Ghi chép thu/chi thuận tiện và theo dõi tình hình tài chính cá nhân.
- Theo dõi nhiều ví/tài khoản, ngân sách, mục tiêu tiết kiệm, khoản định kỳ.
- Nhận tổng kết và nhắc ghi thu chi mỗi ngày vào **21:00**, cùng các cảnh báo và nhắc thanh toán liên quan.
- Giao diện iOS hiện đại, tối giản, dễ sử dụng; ứng dụng dùng offline với dữ liệu cục bộ trên iPhone và sao lưu chính lên Google Drive khi có mạng.

### 1.3 Tiêu chí thành công
- Mục tiêu cải thiện tốc độ và sự thuận tiện nhập liệu đã được xác nhận.
- **Chưa có chỉ số nghiệm thu định lượng** (ví dụ số giây/thao tác cho một giao dịch). Xem OQ-01.

## 2. Phạm vi và giới hạn

### 2.1 Trong phạm vi
- Ghi giao dịch thủ công, quản lý danh mục, ví/tài khoản và chuyển tiền giữa ví.
- Ngân sách tổng tháng và theo danh mục, cảnh báo ngân sách.
- Trang chủ tổng quan, báo cáo thống kê, tìm kiếm giao dịch.
- Hóa đơn/giao dịch định kỳ và nhắc thanh toán; mục tiêu tiết kiệm và thông báo tiến độ.
- Quét hóa đơn hỗ trợ nhập; xuất dữ liệu tài chính PDF.
- Đăng nhập username/password cho nhiều tài khoản tách biệt; giữ phương án Apple ID bổ sung tùy điều kiện triển khai; bảo vệ bằng passkey/WebAuthn; offline; sao lưu Google Drive tách riêng từng người.

### 2.2 Ngoài phạm vi **phiên bản đầu**
- Đồng bộ giao dịch ngân hàng tự động.
- Chia sẻ dữ liệu với người khác.
- Ứng dụng Web hoặc Android.

### 2.3 Tiến độ
- Phát triển theo từng giai đoạn, **chưa có hạn chót**.
- Mức ưu tiên được xác nhận ở mục 4, không tự suy ra lịch giao hàng hay cam kết chức năng theo sprint.

## 3. Tác nhân và quyền truy cập

| Tác nhân | Phạm vi | Quyền/hành vi đã xác nhận |
|---|---|---|
| Mỗi tài khoản người dùng (2–3 người) | Dữ liệu tài chính của chính tài khoản đó | Ghi và quản lý thu chi, ví, ngân sách, mục tiêu, báo cáo, thông báo và dữ liệu xuất |

- Có 2–3 tài khoản riêng biệt, đều là người dùng quản lý tài chính cá nhân; **không có chức năng chia sẻ dữ liệu thu chi**.
- Đăng nhập username/password là bắt buộc; Apple ID là lựa chọn bổ sung tùy khả năng triển khai; bảo vệ phiên bằng WebAuthn/passkey theo PWA-02.
- Quy tắc truy cập: chỉ được truy cập dữ liệu tài chính và sao lưu của chính tài khoản xác thực.

## 4. Danh mục yêu cầu chức năng và mức ưu tiên

| ID | Nhóm | Ưu tiên | Yêu cầu có thể kiểm chứng | Tiêu chí nghiệm thu từ phần đã xác nhận |
|---|---|---|---|---|

| FR-01 | Giao dịch | Cốt lõi | Nhập thủ công khoản thu hoặc khoản chi. | Có thể tạo và lưu một giao dịch thu/chi bằng nhập thủ công. |

| FR-02 | Giao dịch | Cốt lõi | Lưu số tiền, danh mục thu/chi, ngày giờ, ví/tài khoản, ghi chú và nhãn tùy chỉnh. | Giao dịch được lưu với sáu nhóm thông tin đã xác nhận. |

| FR-03 | Giao dịch | Cốt lõi | Sửa, xóa giao dịch và hoàn tác việc xóa trong 10 giây. | Có thể sửa/xóa giao dịch; sau khi xóa, thao tác hoàn tác thực hiện được trong 10 giây. |

| FR-04 | Danh mục | Cốt lõi | Cung cấp danh mục thu chi mặc định, cho phép thêm, sửa, xóa danh mục. | Có danh mục mặc định và người dùng thực hiện được thêm/sửa/xóa danh mục. |

| FR-05 | Ví/tài khoản | Cốt lõi | Quản lý nhiều ví, tài khoản và số dư tương ứng. | Người dùng theo dõi được nhiều ví/tài khoản và số dư. |

| FR-06 | Ví/tài khoản | Cốt lõi | Chuyển tiền giữa các ví/tài khoản mà không tính vào thu nhập hoặc chi tiêu. | Thực hiện chuyển tiền giữa ví/tài khoản; khoản chuyển không xuất hiện như thu/chi trong tổng hợp. |

| FR-07 | Ngân sách | Cốt lõi | Thiết lập ngân sách tổng tháng và ngân sách riêng theo từng danh mục. | Người dùng đặt và xem được cả hai loại ngân sách. |

| FR-08 | Ngân sách | Cốt lõi | Cảnh báo khi sử dụng 80% và khi đạt/vượt 100% ngân sách. | Có cảnh báo tại các ngưỡng 80% và đạt/vượt 100%. |

| FR-09 | Dashboard | Cốt lõi | Hiển thị số dư tổng, thu/chi tháng, ngân sách còn lại và tỷ lệ dùng, giao dịch gần nhất, biểu đồ nhanh, hóa đơn sắp hạn và tiến độ tiết kiệm. | Trang chủ hiển thị đủ bảy nhóm thông tin đã xác nhận. |

| FR-10 | Thông báo | Cốt lõi | Gửi tổng kết thu chi cuối ngày lúc 21:00. | Tổng kết ngày được lên lịch lúc 21:00. |

| FR-11 | Thông báo | Cốt lõi | Nhắc ghi thu chi lúc 21:00 nếu trong ngày chưa nhập giao dịch. | Khi chưa nhập giao dịch trong ngày, có nhắc lúc 21:00. |

| FR-12 | Thông báo | Cốt lõi | Nhắc thanh toán hóa đơn/khoản định kỳ trước hạn một ngày và đúng ngày đến hạn. | Có thông báo ở cả hai thời điểm đã xác nhận. |

| FR-13 | Thông báo | Cốt lõi | Thông báo mốc tiết kiệm 25%, 50%, 75%, 100%, khi gần hạn và tổng kết tuần. | Có các loại thông báo đã chọn; thời điểm “gần hạn” và lịch tuần chưa được chốt. |

| FR-14 | Báo cáo | Cao | Biểu đồ tròn cơ cấu chi tiêu theo danh mục và biểu đồ cột/đường thu chi theo ngày, tuần, tháng. | Các hình thức báo cáo đã xác nhận có thể được xem. |

| FR-15 | Báo cáo | Cao | So sánh thu chi giữa các tháng, theo ví/tài khoản và so sánh thực tế với ngân sách. | Có đủ ba loại so sánh và thống kê. |

| FR-16 | Tiết kiệm | Cao | Quản lý nhiều mục tiêu tiết kiệm có số tiền đích và thời hạn hoàn thành. | Có thể tạo và theo dõi nhiều mục tiêu cùng thông tin số tiền đích/hạn. |

| FR-17 | Định kỳ | Cao | Đến kỳ gửi nhắc và chỉ ghi giao dịch sau khi người dùng xác nhận thanh toán. | Khi chưa xác nhận, giao dịch định kỳ chưa được ghi; sau xác nhận mới ghi. |

| FR-18 | Tìm kiếm | Cao | Tìm và lọc giao dịch theo thời gian, danh mục, ví, số tiền, nhãn và từ khóa. | Người dùng sử dụng được sáu tiêu chí lọc/tìm kiếm. |

| FR-19 | Quét hóa đơn | Trung bình | Cho phép quét hóa đơn để hỗ trợ nhập giao dịch. | Có điểm vào luồng quét hóa đơn. |

| FR-20 | Quét hóa đơn | Trung bình | Gợi ý số tiền, ngày và nội dung gần đúng; người dùng kiểm tra, xác nhận trước khi lưu. | Không lưu kết quả nhận diện thành giao dịch trước khi người dùng xác nhận. |

| FR-21 | Xuất dữ liệu | Trung bình | Xuất dữ liệu tài chính ở định dạng PDF. | Người dùng xuất được dữ liệu tài chính dưới dạng PDF. |

### 4.1 Ghi chú về ưu tiên
- **Cốt lõi:** Giao dịch, ví/tài khoản, danh mục, ngân sách, thông báo (và nội dung Dashboard đã xác nhận trong file nguồn).
- **Cao:** Báo cáo, định kỳ, tiết kiệm, tìm kiếm.
- **Trung bình:** Quét hóa đơn, xuất PDF.
- **Nền tảng bắt buộc giữ:** Bảo mật và offline/sao lưu Google Drive, không bị loại khỏi kế hoạch vì phân chia mức ưu tiên chức năng.
- Một số thông báo cốt lõi phụ thuộc dữ liệu từ chức năng ưu tiên cao (ví dụ tiến độ tiết kiệm, giao dịch định kỳ). Tài liệu **không tự quyết định thứ tự đưa từng thành phần phụ thuộc vào phiên bản nào**.

## 5. Luồng nghiệp vụ và quy tắc xử lý

### WF-01 — Nhập thu/chi thủ công
1. Người dùng chọn ghi một khoản thu hoặc chi.
2. Người dùng cung cấp số tiền, danh mục, ngày/giờ, ví/tài khoản, ghi chú và nhãn tùy chỉnh.
3. Người dùng lưu giao dịch; giao dịch trở thành dữ liệu theo dõi thu/chi.

**Ràng buộc:** Bộ trường cần lưu đã được xác nhận; tài liệu nguồn chưa xác định trường nào bắt buộc, mặc định trường nào, hay các quy tắc hợp lệ chi tiết.

### WF-02 — Sửa, xóa, hoàn tác
1. Người dùng sửa hoặc xóa một giao dịch.
2. Nếu xóa, người dùng có thể hoàn tác trong **10 giây** kể từ thao tác xóa.
3. Không yêu cầu lịch sử chỉnh sửa chi tiết.

**Chưa chốt:** Cách thể hiện thao tác hoàn tác trên giao diện và cách xử lý sau khi hết 10 giây.

### WF-03 — Quét hóa đơn
1. Người dùng quét hóa đơn.
2. Hệ thống gợi ý **số tiền, ngày và nội dung gần đúng**.
3. Người dùng kiểm tra, xác nhận thông tin trước khi lưu giao dịch.

**Bắt buộc:** Không tự lưu giao dịch chỉ dựa vào kết quả quét chưa xác nhận. **Ngoại lệ chưa chốt:** OQ-04.

### WF-04 — Quản lý danh mục và ví
1. Có sẵn danh mục thu và chi mặc định.
2. Người dùng thêm, sửa, xóa danh mục.
3. Người dùng quản lý nhiều ví/tài khoản với số dư.
4. Khi chuyển tiền giữa các ví/tài khoản, hệ thống **không tính khoản chuyển vào tổng thu hoặc tổng chi**.

### WF-05 — Ngân sách và cảnh báo
1. Người dùng lập ngân sách tổng tháng và ngân sách theo từng danh mục.
2. Hệ thống theo dõi mức đã dùng và phần ngân sách còn lại.
3. Hệ thống cảnh báo ở **80%** và khi **đạt hoặc vượt 100%** ngân sách.

**Chưa chốt chi tiết kỹ thuật:** Phương pháp tính/đặt lại ngưỡng, chống gửi lặp và cách thông báo được thực hiện; tài liệu không tự quy định.

### WF-06 — Khoản định kỳ và hóa đơn
1. Hệ thống nhắc thanh toán **trước ngày đến hạn 1 ngày** và **vào ngày đến hạn**.
2. Khi đến kỳ, hệ thống gửi thông báo yêu cầu xác nhận.
3. **Chỉ khi người dùng xác nhận đã thanh toán**, giao dịch định kỳ mới được ghi.

### WF-07 — Mục tiêu tiết kiệm
1. Người dùng quản lý nhiều mục tiêu, mỗi mục tiêu có **số tiền đích** và **hạn hoàn thành**.
2. Hệ thống thông báo mốc **25%, 50%, 75%, 100%**, thông báo khi **gần hạn** và tổng kết **hằng tuần**.
3. Khoảng thời gian “gần hạn” và lịch tổng kết tuần chưa được quyết định (OQ-03).

### WF-08 — Thông báo hằng ngày
1. Lúc **21:00**, hệ thống gửi tổng kết thu chi cuối ngày.
2. Nếu chưa nhập giao dịch trong ngày, lúc **21:00** hệ thống nhắc ghi thu chi.
3. Ngoài ra có nhắc thanh toán và thông báo tiết kiệm theo các quy tắc trên.

**Ghi chú:** Tài liệu chưa xác nhận thứ tự/việc gộp hai thông báo lúc 21:00 hoặc hành vi khi thiếu quyền thông báo.

### WF-09 — Tra cứu, báo cáo và xuất
1. Người dùng xem trang chủ và các nhóm báo cáo được chỉ rõ ở mục 6.
2. Người dùng tìm và lọc theo **thời gian, danh mục, ví, số tiền, nhãn, từ khóa**.
3. Người dùng xuất dữ liệu tài chính thành **PDF**.

## 6. Đặc tả nội dung màn hình (không phải thiết kế giao diện)

| Khu vực chức năng | Nội dung/hành vi đã xác nhận | Liên kết |
|---|---|---|
| Trang chủ (Dashboard) | Tổng số dư tất cả ví; tổng thu/chi tháng hiện tại; ngân sách còn lại và % đã dùng; giao dịch gần nhất; biểu đồ chi tiêu nhanh; hóa đơn sắp đến hạn; tiến độ tiết kiệm | FR-09 |
| Ghi và quản lý giao dịch | Nhập thu/chi; sáu nhóm dữ liệu giao dịch; sửa, xóa, hoàn tác 10 giây | FR-01–03 |
| Quét hóa đơn | Nhận diện số tiền, ngày, nội dung gần đúng, yêu cầu người dùng kiểm tra trước lưu | FR-19–20 |
| Danh mục | Danh mục mặc định; thêm/sửa/xóa | FR-04 |
| Ví/tài khoản | Nhiều ví/tài khoản, số dư; chuyển tiền nội bộ không tính thu/chi | FR-05–06 |
| Ngân sách | Ngân sách tháng tổng và theo danh mục; cảnh báo ngưỡng 80%, đạt/vượt 100% | FR-07–08 |
| Báo cáo | Biểu đồ tròn theo danh mục; biểu đồ cột/đường theo ngày/tuần/tháng; so sánh tháng; theo ví; thực tế so với ngân sách | FR-14–15 |
| Tiết kiệm | Nhiều mục tiêu; số tiền đích; hạn; thông báo mốc và tổng kết tuần | FR-13, FR-16 |
| Định kỳ và thanh toán | Nhắc trước hạn 1 ngày và ngày đến hạn; xác nhận trước ghi giao dịch | FR-12, FR-17 |
| Tìm kiếm | Lọc theo sáu tiêu chí được chốt | FR-18 |
| Xuất dữ liệu | Tạo PDF dữ liệu tài chính | FR-21 |

**Giới hạn:** Đây là các **khu vực chức năng**, không mặc định mỗi dòng là một màn hình độc lập. Số màn hình, tab, thứ tự điều hướng, thành phần UI và vị trí nút chưa được người dùng xác nhận.

## 7. Dữ liệu nghiệp vụ mức khái niệm

| Đối tượng | Các thuộc tính đã xác nhận | Mối liên hệ/ngữ cảnh |
|---|---|---|
| Giao dịch | Số tiền; danh mục thu/chi; ngày và giờ; ví/tài khoản; ghi chú; nhãn tùy chỉnh | Dùng để tổng hợp thu chi, theo dõi ví và tra cứu |
| Danh mục | Danh mục thu/chi mặc định và các danh mục do người dùng tự quản lý | Được chọn khi ghi giao dịch; dùng theo dõi ngân sách và báo cáo |
| Ví/tài khoản | Nhiều ví/tài khoản; số dư | Giao dịch liên kết ví; có chuyển tiền giữa ví |
| Ngân sách | Ngân sách tổng tháng; ngân sách danh mục; mức sử dụng | Ngưỡng cảnh báo 80% và 100% |
| Mục tiêu tiết kiệm | Số tiền đích; hạn hoàn thành | Theo dõi tiến độ và thông báo |
| Hóa đơn/giao dịch định kỳ | Thông tin lịch đến hạn và xác nhận thanh toán | Thông báo trước hạn 1 ngày/ngày đến hạn; ghi giao dịch sau xác nhận |
| Dữ liệu báo cáo | Thu/chi theo thời gian, danh mục, ví/tài khoản; thực tế so với ngân sách | Dashboard, báo cáo, PDF |

**Không phải thiết kế cơ sở dữ liệu:** Không tự quyết định các cột bắt buộc khác, khóa, kiểu dữ liệu, quan hệ vật lý, bảng, mô hình đồng bộ hoặc lưu trữ.

## 8. Yêu cầu phi chức năng, công nghệ và tích hợp

| Mã | Phạm vi | Nội dung đã xác nhận |
|---|---|---|
| NFR-01 | Giao diện | Phong cách iOS hiện đại, tối giản, dễ sử dụng |
| NFR-02 | Nền tảng | PWA cài trên iPhone từ Safari (iOS 26 trở lên) |
| NFR-03 | Xác thực | Bắt buộc username/password cho 2–3 tài khoản khác nhau; Sign in with Apple là phương thức bổ sung còn phụ thuộc điều kiện Apple Developer |
| NFR-04 | Kiểm soát truy cập | Chọn WebAuthn/passkey; phân tách dữ liệu theo user ID ở kho local, API và sao lưu; người dùng không truy cập dữ liệu người khác |
| NFR-05 | Offline | Ứng dụng có thể sử dụng khi không có Internet |
| NFR-06 | Dữ liệu | Lưu dữ liệu cục bộ trên iPhone để dùng offline; dùng **Google Drive làm nơi sao lưu chính** khi có Internet. Chưa chốt lịch sao lưu, quản lý phiên bản và cách khôi phục (OQ-05). Không mặc định đồng bộ thời gian thực. |

iOS tối thiểu **26** đã được xác nhận ở TD-01. Phương án React/TypeScript/PWA trên Windows đã được người dùng chấp thuận; nhiều thư viện, giải pháp Apple ID/passkey/Web Push vẫn cần xác minh. Xem **phụ lục 14** để biết stack triển khai được đề xuất, không được đánh đồng với yêu cầu đã chốt.

## 9. Bảng quy tắc nghiệp vụ

| ID | Quy tắc đã xác nhận | Yêu cầu liên quan |
|---|---|---|
| BR-01 | Chuyển tiền giữa ví không làm tăng tổng thu hoặc tổng chi | FR-06 |
| BR-02 | Xóa giao dịch có thể hoàn tác trong 10 giây | FR-03 |
| BR-03 | Kết quả quét hóa đơn phải được người dùng kiểm tra và xác nhận trước khi lưu | FR-20 |
| BR-04 | Cảnh báo ngân sách khi dùng 80% và khi đạt/vượt 100% | FR-08 |
| BR-05 | Gửi tổng kết thu chi mỗi ngày lúc 21:00 | FR-10 |
| BR-06 | Nếu trong ngày chưa nhập giao dịch thì nhắc vào 21:00 | FR-11 |
| BR-07 | Nhắc thanh toán trước hạn 1 ngày và đúng ngày đến hạn | FR-12 |
| BR-08 | Chỉ ghi giao dịch định kỳ khi người dùng xác nhận thanh toán | FR-17 |
| BR-09 | Thông báo tiến độ tiết kiệm tại 25%, 50%, 75%, 100%, gần hạn và tổng kết hằng tuần | FR-13 |

## 10. Phân kỳ theo ưu tiên đã xác nhận

| Nhóm | Nội dung | Ghi chú |
|---|---|---|
| Cốt lõi | Giao dịch thủ công và quản lý; danh mục; nhiều ví và chuyển tiền; ngân sách và ngưỡng; Dashboard; các loại thông báo | Cấu phần thông báo về chức năng chưa triển khai phụ thuộc phân kỳ thực tế |
| Cao | Báo cáo; khoản định kỳ; mục tiêu tiết kiệm; tìm kiếm/lọc | Thứ tự triển khai bên trong nhóm chưa được quyết định |
| Trung bình | Quét hóa đơn và hỗ trợ điền dữ liệu; xuất PDF | Chưa xác nhận kỹ thuật quét hoặc mẫu PDF |
| Yêu cầu nền tảng giữ lại | Apple ID; Face ID/mật mã; iOS; lưu cục bộ offline; sao lưu Google Drive | Cơ chế và lịch sao lưu/khôi phục cụ thể chưa chốt (OQ-05) |

**Chưa có lịch phát hành hay phạm vi từng phiên bản theo ngày.** Mức ưu tiên chỉ là căn cứ lập kế hoạch.

## 11. Câu hỏi chưa trả lời — KHÔNG đưa vào phần đã xác nhận

| ID | Câu hỏi | Ảnh hưởng |
|---|---|---|
| OQ-01 | Tiêu chí thành công **đo được** của bản đầu là gì (chẳng hạn thời gian ghi 1 giao dịch)? | Nghiệm thu mục tiêu nhập nhanh |
| OQ-02 | Có cần chuyển dữ liệu lịch sử từ **Sổ Thu Chi MISA** sang ứng dụng mới không? | Phạm vi nhập/chuyển dữ liệu ban đầu |
| OQ-03 | “Gần hạn” tiết kiệm là trước bao nhiêu ngày? Tổng kết tiết kiệm hằng tuần gửi vào ngày và giờ nào? | Lịch thông báo tiết kiệm |
| OQ-04 | Khi quét hóa đơn không nhận diện được hoặc gợi ý sai, ứng dụng phải xử lý cụ thể thế nào? | Luồng ngoại lệ và nghiệm thu quét hóa đơn |
| OQ-05 | Lịch/kích hoạt sao lưu Google Drive, số phiên bản giữ lại và cách khôi phục dữ liệu sẽ được thực hiện như thế nào? | Sao lưu, khôi phục và kiểm thử |

Các câu hỏi trên **chưa có câu trả lời chính thức**. Không coi các ví dụ trong câu hỏi là phương án mặc định.

## 12. Kiểm tra tính nhất quán và giới hạn tài liệu

- Gồm **21 yêu cầu chức năng** được ánh xạ từ 21 hàng trong file yêu cầu đã xác nhận, không tạo thêm chức năng mới.
- Các quy tắc giờ và ngưỡng giữ nguyên: **21:00; 80%; đạt/vượt 100%; trước hạn 1 ngày; 10 giây; 25/50/75/100%**.
- Quét hóa đơn chỉ **gợi ý** dữ liệu; không mặc định tự động ghi nhận.
- Giao dịch định kỳ chỉ ghi **sau xác nhận**.
- Chuyển tiền giữa ví không được tính thu/chi.
- Chỉ xuất **PDF**; không thêm Excel/CSV.
- Giữ rõ **5 câu hỏi mở** ở mục 11; các chỗ còn thiếu trong các mục khác được mô tả là chưa xác định, không ngầm quyết định.
- Các tiêu chí nghiệm thu hiện tại mang tính **chức năng/quan sát**, chưa thay thế kịch bản kiểm thử chi tiết hoặc tiêu chí hiệu năng định lượng.


## 13. Lịch sử cập nhật sau xác nhận
- **2026-10-22 — Thay đổi lưu trữ được người dùng xác nhận:** Dữ liệu cục bộ trên iPhone để chạy offline, **Google Drive là nơi sao lưu chính** thay cho iCloud. Không thay đổi 21 FR, 9 quy tắc nghiệp vụ hay các yêu cầu chức năng khác. OQ-05 nay chỉ còn các chi tiết triển khai sao lưu/khôi phục chưa được xác nhận.


- **22/10/2026:** Người dùng xác nhận chuyển sang PWA phát triển trên Windows, không App Store/Apple Developer trả phí; NFR-03/04 và push được đánh dấu cần giải pháp tương đương khả thi, không tự phê duyệt.

## 14. Phụ lục kỹ thuật — Phương án React + TypeScript + PWA (đã chọn hướng triển khai)

**Thay đổi được phê duyệt 22/10/2026:** Chuyển từ iOS native/SwiftUI/SwiftData sang PWA phát triển trên Windows, không phát hành App Store, ưu tiên chi phí 0đ. 21 FR và các quy tắc tiền tệ, ngân sách, sao lưu, khôi phục không bị hủy. **Tính khả thi của NFR-03/NFR-04 và thông báo khi app đóng phải chốt lại, không được tuyên bố đã đáp ứng.**

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

### 14.1 Ma trận thay thế công nghệ

| Thành phần native cũ | Thay thế PWA | Điều kiện |
|---|---|---|
| SwiftUI / Xcode | React + TypeScript + Vite | Build trên Windows |
| SwiftData | IndexedDB + Dexie | Không bảo đảm lưu trữ vĩnh viễn nếu dữ liệu website bị xóa |
| Swift Charts | Recharts | Kiểm thử biểu đồ trên Safari iOS |
| VisionKit/Vision | Camera web + OCR JS | Cần kiểm chứng tốc độ/độ chính xác |
| CryptoKit/Keychain | Web Crypto + quản lý phiên/khóa phù hợp web | Không cất recovery key dạng plaintext trong IndexedDB |
| Sign in with Apple native | Sign in with Apple cho website (nếu đáp ứng điều kiện) | Mở: OAuth/Apple Developer và tính khả thi miễn phí |
| Face ID native | WebAuthn/passkey (đề xuất) | Mở: user verification/khóa app |
| UserNotifications native | Web Push + Service Worker + dịch vụ gửi theo lịch | Mở: thông báo 21:00 khi đóng app |
| PDF renderer native | pdf-lib | Cần kiểm thử font tiếng Việt |

### 14.2 Tiêu chí/ngoại lệ phải kiểm chứng

- PWA cài từ Safari, được cấp quyền thông báo bằng thao tác người dùng; HTTPS, manifest và service worker phải đúng.
- Trên iOS, Web Push cần ứng dụng web được thêm vào Home Screen; không thể dựa vào trình duyệt luôn chạy nền. Thiết lập máy chủ gửi push có lịch mới đáp ứng thông báo khi đóng app; việc gửi đúng từng phút vẫn phụ thuộc dịch vụ, thiết bị và kết nối.
- Do dữ liệu tài chính không nằm trên máy chủ, dịch vụ push **không có đủ dữ liệu** để biết liệu đã ghi giao dịch trong ngày hay chưa, trừ khi người dùng đồng ý gửi metadata tối thiểu lên backend; cần quyết định riêng ranh giới riêng tư và thông báo tổng quát.
- Google OAuth cần quyền tối thiểu `drive.appdata`; archive mã hóa có version trong `appDataFolder`. Chi tiết lịch sao lưu/retention vẫn ở OQ-05.
- Tiêu chí 0đ là mục tiêu trong hạn mức free tier, không phải cam kết mọi dịch vụ miễn phí vô thời hạn.

### 14.3 Câu hỏi chưa giải quyết

Giữ nguyên OQ-01–OQ-05 tại mục 11, bổ sung các điểm triển khai: **PWA-AUTH** (đăng nhập Apple ID web), **PWA-LOCK** (passkey/khóa app), **PWA-PUSH** (Web Push/serverless/metadata riêng tư), **PWA-OFFLINE** (giới hạn lưu trữ và khôi phục khi xóa dữ liệu Safari). Đây không phải các quyết định được xác nhận.

### 14.4 Tài liệu tham khảo

- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- https://webkit.org/blog/13878/
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.cloudflare.com/workers/configuration/cron-triggers/

## Phụ lục 15 — Thay đổi đã xác nhận: đa tài khoản và PWA (22/10/2026)

**Thay đổi so với mục phạm vi đơn người dùng cũ:** ứng dụng phục vụ **2–3 người với tài khoản độc lập**, không phải tài khoản chung. Luồng chính gồm đăng nhập username/password, đăng xuất, tách dữ liệu cục bộ và giới hạn quyền thao tác theo tài khoản; không có chia sẻ thu chi giữa người dùng. Các 21 FR nghiệp vụ ban đầu và mức ưu tiên giữ nguyên; bổ sung:

| Mã | Ưu tiên | Tiêu chí nghiệm thu |
|---|---|---|
| FR-22 | Cốt lõi | Người dùng có tài khoản hợp lệ đăng nhập bằng username/password; sai thông tin không tạo phiên |
| FR-23 | Cốt lõi | 2–3 tài khoản có thể sử dụng ứng dụng độc lập; dữ liệu của tài khoản A không hiển thị hoặc thao tác được bởi B |
| FR-24 | Cốt lõi | Đăng xuất/chuyển tài khoản không để lộ dữ liệu, phiên hay khóa giải mã của tài khoản trước |
| FR-25 | Cốt lõi | Backup/restore Google Drive được phân vùng và kiểm tra chủ sở hữu theo tài khoản; không khôi phục nhầm dữ liệu người khác |

**Các quyết định đã xác nhận:** PWA-01 giữ Sign in with Apple như phương thức bổ sung với điều kiện Developer chưa đáp ứng; PWA-02 passkey/WebAuthn; PWA-03 Web Push + Cloudflare Workers/Cron; PWA-04 IndexedDB và Google Drive archive mã hóa có phiên bản. Chọn username/password làm luồng bắt buộc mới nhất, không loại bỏ mong muốn Apple ID.

**Yêu cầu backend tối thiểu:** Xác thực username/password phải xác minh phía server, lưu chỉ mật khẩu dạng hash thích hợp, dùng phiên an toàn và giới hạn thử đăng nhập; đề xuất Workers + D1 trong hạn mức miễn phí. Backend chỉ cần quản lý danh tính/phiên/subscription, không nhất thiết lưu giao dịch thu chi.

**Còn mở để xác nhận:** Quên mật khẩu/khôi phục; quy tắc mở offline sau đăng nhập; lựa chọn Drive cho từng tài khoản; Apple ID triển khai giai đoạn nào. Những nội dung này chưa được coi là yêu cầu đã chốt.

## Phụ lục 16 — Phân quyền Admin/User (đã xác nhận 22/10/2026) <!-- RBAC-ADMIN-2026-10-22 -->

**Quyết định cập nhật:** Chỉ **Super Admin** được tạo tài khoản mới; User không thể tạo tài khoản; không cho tự đăng ký công khai. Super Admin có thể truy cập/quản lý dữ liệu tài chính của mọi tài khoản, còn User bị cô lập dữ liệu.

| Mã | Mức ưu tiên | Yêu cầu và tiêu chí nghiệm thu |
|---|---|---|
| FR-26 | Cốt lõi | Admin đăng nhập hợp lệ được tạo tài khoản User mới; hệ thống lưu tài khoản và cho phép User đăng nhập bằng username/password. |
| FR-27 | Cốt lõi | User hoặc khách chưa đăng nhập không có quyền tạo tài khoản; mọi yêu cầu API tạo tài khoản trái quyền đều bị từ chối, ngay cả khi gọi trực tiếp không qua UI. |
| FR-28 | Cốt lõi | Super Admin được xem/thêm/sửa/xóa/xuất dữ liệu tài chính của mọi tài khoản sau khi backend xác nhận vai trò; User chỉ được thao tác trên tài khoản của mình. Truy cập backup mã hóa phải thỏa điều kiện cấp quyền Drive và khóa. |

**Ma trận phân quyền:**

| Chức năng | Admin | User |
|---|---|---|
| Đăng nhập/đăng xuất | Có | Có |
| Tạo tài khoản mới vai trò User | Có | Không |
| Ghi thu chi, quản lý ví, ngân sách, báo cáo của chính mình | Có | Có |
| Dữ liệu thu chi của tài khoản khác | Có (Super Admin) | Không |
| Backup tài khoản khác | Có nếu được cấp quyền Drive và khóa giải mã | Không |
| Tự đăng ký không có tài khoản | Không | Không |

**Chưa xác nhận chi tiết triển khai:** bootstrap Super Admin đầu tiên, cơ chế reset/cấp mật khẩu, bổ nhiệm thêm Super Admin, cách cấp khóa khôi phục và truy cập dữ liệu giữa thiết bị, chính sách vô hiệu hóa phiên. Quyền quản trị tối cao đã được xác nhận, nhưng không bỏ qua xác thực và bảo mật.


## Phụ lục 17 — Quyền Super Admin toàn hệ thống (đã xác nhận 22/10/2026) <!-- SUPERADMIN-2026-10-22 -->

**Ghi đè các quy định Admin không được truy cập dữ liệu của User trong phiên bản trước.** Một tài khoản **Super Admin** có quyền toàn hệ thống, được xem, thêm, sửa, xóa dữ liệu thu chi, ví, danh mục, ngân sách, mục tiêu tiết kiệm của **mọi tài khoản** và quản lý tài khoản/cấu hình. **User** chỉ được thao tác trên dữ liệu thuộc chính mình. Đăng ký công khai vẫn tắt.

| Mã | Ưu tiên | Tiêu chí nghiệm thu |
|---|---|---|
| FR-28 (sửa) | Cốt lõi | Super Admin đã xác thực có thể chọn tài khoản đích và xem/thêm/sửa/xóa dữ liệu tài chính của tài khoản đó; User thực hiện cùng hành vi trên tài khoản khác bị trả 403 hoặc chặn truy cập. |
| FR-29 (mới) | Cốt lõi | Server xác thực role từ session, kiểm tra quyền mỗi API có tài khoản đích, ghi nhật ký hành động quản trị xuyên tài khoản (actor, target, action, timestamp), không tin tham số role từ client. |
| FR-30 (mới) | Cốt lõi | Giao diện Super Admin có chức năng chọn tài khoản đang quản trị; giao diện User không có chức năng này; mọi dữ liệu hiển thị ghi rõ tài khoản sở hữu. |

**Ma trận quyền:**

| Hành động | Super Admin | User |
|---|---|---|
| Tạo và quản trị tài khoản; cấu hình hệ thống | Có | Không |
| Quản lý thu chi của bản thân | Có | Có |
| Xem/thêm/sửa/xóa/xuất dữ liệu tài khoản khác | Có | Không |
| Truy cập backup tài khoản khác | Được phép về nghiệp vụ, cần quyền Google Drive và khóa giải mã hợp lệ | Không |

**Giới hạn kiến trúc hiện hành:** IndexedDB nằm trên từng iPhone và Google Drive chỉ chứa backup mã hóa theo người dùng. Chỉ đổi RBAC không khiến Super Admin tự đọc được dữ liệu chưa upload hoặc giải mã backup bằng khóa riêng của User. Chưa xác nhận cơ chế đồng bộ chia sẻ, ủy quyền Google Drive, trao khóa giải mã, xử lý sửa đổi chéo và xung đột dữ liệu. Các mục này là **quyết định kỹ thuật còn mở**, không được xem là đã có giải pháp vận hành đầy đủ. Bảo mật, kiểm toán và phân tách User vẫn bắt buộc.


## Quyết định mới nhất — Google Drive tập trung của Super Admin (22/10/2026)

> **Đã được người dùng xác nhận.** Phần này ghi đè mọi đoạn cũ nói mỗi người sử dụng Google Drive riêng hoặc mỗi User phải tự cấp quyền OAuth Google Drive để sao lưu.

- Tất cả người dùng (dự kiến 2–3 tài khoản) có dữ liệu tài chính riêng trong IndexedDB trên iPhone của mình để hoạt động offline.
- **Tất cả bản sao lưu của mọi tài khoản phải được lưu vào duy nhất Google Drive do Super Admin sở hữu**; không yêu cầu User có hoặc kết nối tài khoản Google Drive riêng.
- Bản sao lưu được mã hóa và có phiên bản; tách biệt rõ theo `ownerUserId` và ID bản sao lưu; User chỉ được sao lưu và khôi phục dữ liệu của bản thân. Super Admin có quyền quản trị sao lưu và dữ liệu mọi tài khoản sau khi xác thực/ủy quyền phù hợp.
- Google Drive là **đích sao lưu**, không mặc nhiên là cơ sở dữ liệu giao dịch realtime. Dữ liệu trên iPhone User chưa tải lên sẽ không xuất hiện trong bản sao lưu Super Admin có thể đọc.
- Không nhúng Google OAuth access token/refresh token hoặc khóa bí mật của Super Admin vào mã React PWA, IndexedDB của User, hay trả chúng về trình duyệt. Mọi truy cập Google Drive chung phải qua API server được kiểm tra session, `ownerUserId` và role.
- Vẫn phải thiết kế cách quản lý khóa mã hóa để Super Admin có thể giải mã hợp lệ bản sao lưu của User mà không lưu khóa khôi phục dạng văn bản thuần trên server.

**Cần thiết kế/chốt tiếp, chưa tự xem là quyết định được phê duyệt:** (1) OAuth Google cấp quyền cho dịch vụ server truy cập Drive của Super Admin, lưu và xoay vòng refresh token an toàn; (2) chính sách cấp khóa giải mã cho Admin và khôi phục khi mất khóa; (3) chu kỳ tự sao lưu, số phiên bản và cơ chế retry; (4) Admin xem dữ liệu đã backup hay cần dữ liệu mới nhất, và nếu Admin sửa dữ liệu User thì đồng bộ ngược thế nào. Các OQ còn mở khác vẫn giữ nguyên.

| Mã | Ưu tiên | Tiêu chí nghiệm thu bổ sung |
|---|---|---|
| FR-31 | Cốt lõi | Mọi tài khoản gửi archive backup đã mã hóa qua API server để lưu vào Google Drive của Super Admin, không cần đăng nhập Google từ User. |
| FR-32 | Cốt lõi | API backup/restore kiểm tra session, vai trò và `ownerUserId`; User không được truy cập archive tài khoản khác; Super Admin được quản trị theo quyền đã chốt. |
| NFR-DRIVE-01 | Cốt lõi | Token/refresh token Google Drive của Super Admin không lộ ra trình duyệt hay gói build frontend; server quản lý bí mật an toàn. |

## Phụ lục — Đặc tả đồng bộ tài chính hai chiều <!-- SYNC-2026-10-22 -->

**Đã xác nhận (22/10/2026):** Dữ liệu tài chính được lưu offline riêng trên iPhone bằng IndexedDB và **đồng bộ hai chiều khi có Internet** qua dịch vụ dữ liệu trung tâm. Super Admin có quyền xem/thêm/sửa/xóa dữ liệu mới nhất **đã đồng bộ** của tất cả tài khoản; thay đổi của Admin đồng bộ ngược về iPhone người sở hữu. **Google Drive của Super Admin tiếp tục là đích sao lưu tập trung mã hóa, có phiên bản**, không phải cơ sở dữ liệu đồng bộ trực tiếp.

**Giới hạn:** Dữ liệu mới chỉ lưu ở iPhone đang offline không thể hiện ở Admin cho tới khi đồng bộ thành công; thay đổi Admin cũng chỉ đến iPhone User sau khi thiết bị kết nối lại.

| Mã | Ưu tiên | Hành vi quan sát được / tiêu chí nghiệm thu |
|---|---|---|
| FR-33 | Cốt lõi | User có mạng thêm/sửa/xóa dữ liệu tài chính; server nhận thay đổi theo tài khoản, Super Admin đọc được dữ liệu mới nhất đã đồng bộ. |
| FR-34 | Cốt lõi | Khi offline, User thao tác bình thường, dữ liệu lưu ở IndexedDB; khi nối mạng ứng dụng thử đồng bộ lại và không nhân đôi thao tác đã gửi. |
| FR-35 | Cốt lõi | Super Admin thêm/sửa/xóa dữ liệu User trên hệ thống trung tâm; iPhone User nhận lại thay đổi trong lượt đồng bộ sau. |
| FR-36 | Cốt lõi | Server kiểm tra session, vai trò và `ownerUserId` với mọi API; User không được truy cập dữ liệu người khác, Admin được quản lý tất cả; ghi audit thao tác Admin xuyên tài khoản. |
| FR-37 | Cốt lõi | Backup mã hóa có phiên bản của mọi User tiếp tục đặt trong Google Drive của Super Admin, độc lập với dữ liệu đồng bộ trung tâm. |
| NFR-SYNC-01 | Cốt lõi | Hiển thị trạng thái chưa đồng bộ/đang đồng bộ/lỗi, không báo dữ liệu offline là đã có trên server. |

**Chưa chốt:** quy tắc giải quyết xung đột cùng bản ghi; tần suất đồng bộ, chính sách xóa và hoàn tác qua các thiết bị, lịch backup, chia sẻ khóa khôi phục, giới hạn dịch vụ và phương án khôi phục.

**Hiệu lực:** Phụ lục này thay thế mô tả cũ rằng không có kho tài chính trung tâm hoặc Admin chỉ truy cập snapshot backup. Các chức năng khác giữ nguyên.
