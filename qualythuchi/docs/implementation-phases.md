# Kế hoạch triển khai và nghiệm thu — Quản lý thu chi PWA

> Phiên bản 2.0 — 04/11/2026. Chia lại theo kết quả rà soát mã nguồn và kiểm tra thực tế trong phiên làm việc hiện tại.
> Đây là kế hoạch công việc, không thay thế các quyết định nghiệp vụ đã chốt. Mã phase mới dùng tiền tố **N**; các phase P00–P11 là mã cũ để đối chiếu.

## 1. Cách đọc checklist

- `[x]` nghĩa là công việc cụ thể đã có mã nguồn/cấu hình hoặc đã được kiểm tra đúng như mô tả. Không suy ra cả phase đã nghiệm thu.
- `[ ]` nghĩa là còn phải thực hiện, còn thiếu bằng chứng hoặc cần chốt quyết định. Những mục “nghiệm thu” chưa có bằng chứng luôn để trống.
- Mỗi phase tách **đã có**, **còn làm**, **điều kiện đóng phase**. Chỉ đóng khi toàn bộ điều kiện đạt và có kết quả kiểm tra tương ứng.
- Không tính tỷ lệ hoàn thành bằng số checkbox: backup/restore, cô lập dữ liệu và nghiệm thu thiết bị có trọng lượng khác các chỉnh sửa tài liệu.
- Không đưa mật khẩu, cookie, token hay recovery key vào tài liệu/báo cáo kiểm thử.

## 2. Mốc kiểm chứng hiện tại

| Hạng mục | Bằng chứng gần nhất | Giới hạn |
|---|---|---|
| Ứng dụng local | Đã làm theo README ngày 04/11/2026: npm ci/migrate/dev trên Windows x64 Node 24.21.0; Docker build/stop/up và hai service healthy | Smoke UI bằng Edge headless; không thay thế toàn bộ E2E/iPhone hoặc production |
| Truy cập HTTPS | Đã mở qua trycloudflare.com, trang login HTTP 200, API health/database ok | Tunnel tạm, URL có thể đổi |
| Database Docker local | schema_version = 12 | Không suy ra database cloud có cùng trạng thái |
| Đăng nhập thật | Đã xác minh đăng nhập admin, gửi lại cookie và kiểm tra phiên | Chưa phải nghiệm thu đăng nhập trên iPhone |
| Unit/integration/config | 04/11/2026: npm test đạt 86 Vitest + 57 backend/config sau tối ưu HTTP; bổ sung 3 unit lịch tháng chạy riêng đạt | Không thay thế E2E/UAT; các lượt trước giữ nguyên bằng chứng lịch sử |
| Lint | npm run lint đạt | Theo mã nguồn lúc rà soát |
| Typecheck Docker | npm run typecheck trong container backend, từ /app, đạt | Môi trường cài dependencies trong Docker |
| Typecheck Windows | Đạt sau khi sửa cả 3 junction workspace ngày 04/11/2026; npm run typecheck kết thúc mã 0 | Đã kiểm tra backend, frontend, contracts và kiểu của test |
| Build Windows | npm run check chạy liền mạch đạt mã 0 ngày 04/11/2026, 10:31–10:32 +07:00: gồm Workers dry-run và frontend/PWA | Chạy ngoài sandbox để Wrangler có quyền cần thiết; còn cảnh báo chunk chính trên 500 kB và import sync-storage |
| E2E local | Bộ đầy đủ trước tối ưu: 50 đạt/2 bỏ qua. Lượt tối ưu/lịch tháng kiểm tra có chọn lọc Chromium/WebKit; kết quả và các lần sửa test được ghi trong [báo cáo local](local-performance.md) | Không cộng số ca chạy lặp thành số test mới; chưa nghiệm thu iPhone/cloud |
| Local/HMR mới | Vite native + Wrangler dev Docker giữ volume; start/stop/reuse, proxy/cookie/đọc ví/dashboard và HMR frontend/backend đã xác minh 04/11/2026 | Không seed/reset hoặc chuyển DB; native backend là lựa chọn riêng chưa chạy thay runtime Docker trong lượt này |
| CI/preview/rollback | Có ci.yml, preview.yml, rollback-preview.yml | Chưa có run/version/biên bản cloud để nghiệm thu |

Tài liệu cũ có các kết quả test và checkbox theo thời điểm trước; không lấy chúng thay bằng chứng còn thiếu trong kế hoạch này.

## 3. Tổng quan phase mới

| Phase mới | Mục tiêu | Đối chiếu phase cũ | Trạng thái | Phụ thuộc |
|---|---|---|---|---|
| N00 | Chuẩn hóa môi trường và tài liệu | P00 và nợ môi trường | Hoàn thành phạm vi môi trường local ngày 04/11/2026; đủ hai điều kiện đóng phase | Không |
| N01 | Nghiệm thu nghiệp vụ cốt lõi và phân quyền | P01–P04, P06–P07, P09–P10 | Phần lớn mã nguồn đã có; còn E2E/UAT và rà độ phủ UI | N00 |
| N02 | Hoàn thiện offline và xử lý xung đột | P05 và phần sync P06 | Có engine/outbox; còn UX xung đột và kiểm thử thiết bị | N00, nền nghiệp vụ N01 |
| N03 | Backup/restore Google Drive mã hóa | P11A | Chưa triển khai hoàn chỉnh | N01, N02; chốt chính sách backup/restore |
| N04 | Hoàn thiện thông báo, Passkey và phục hồi truy cập | P08; nhắc việc P07/P10; phần auth còn thiếu | Có mã nguồn/test; còn nội dung và nghiệm thu iPhone | N01; N02 cho nội dung dựa trên dữ liệu sync |
| N05 | OCR hóa đơn | P11B | Chưa triển khai hoàn chỉnh | N01; chốt xử lý OCR lỗi |
| N06 | Xuất PDF | P11C | Chưa triển khai hoàn chỉnh | Báo cáo đã nghiệm thu ở N01 |
| N07 | CI/cloud, UAT cuối và phát hành | Phần nghiệm thu P00 và UAT P11 | Có cấu hình; chưa đủ bằng chứng phát hành | N00–N04; thêm N05/N06 nếu phát hành đủ phạm vi |

**Thứ tự ưu tiên:** N00 → N01 → N02 → N03 → N04 → N05/N06 → N07. Có thể chuẩn bị hạ tầng CI/preview và kiểm thử iPhone từ sớm; không cần đợi đến N07 mới kiểm tra. N05/N06 có thể tách bản phát hành bổ sung; không tự coi chúng đã hoàn thành hoặc bỏ khỏi phạm vi đã yêu cầu.

## 4. N00 — Chuẩn hóa môi trường và tài liệu

**Trạng thái: Hoàn thành phạm vi môi trường local ngày 04/11/2026.** E2E đầy đủ, iPhone, audit dependencies và cloud vẫn theo các mục/phases liên quan, không nằm trong kết luận hoàn thành N00 này.

### Đã có

- [x] Monorepo npm workspaces: frontend, backend và contracts dùng chung.
- [x] Docker frontend/backend, D1 local bền qua restart nhờ named volume.
- [x] Cấu hình dev/test/prod, migration đến 0012 và API health kiểm tra schema.
- [x] PWA manifest, icon, service worker cache app shell; không runtime-cache API.
- [x] Scripts lint/typecheck/test/build và cấu hình Playwright.
- [x] Khởi chạy local và tunnel HTTPS thực tế trong phiên hiện tại.
- [x] AGENTS.md mô tả nghiệp vụ và vị trí mã nguồn.

### Còn làm

- [x] Sửa cả 3 junction backend/frontend/contracts về thư mục dự án hiện tại (04/11/2026); npm ls --workspaces --depth=0 đạt, quét node_modules gốc và các workspace không thấy link hỏng, npm run typecheck trên Windows đạt.
- [x] Chạy lại lint, typecheck, npm test và build đầy đủ trên Windows sau khi sửa môi trường và npm ci (04/11/2026, 10:31–10:32 +07:00): npm run check chạy liền mạch ngoài sandbox đạt mã 0; 76 test Vitest + 57 test backend/config đạt. Không còn lỗi import contracts. Chưa chạy E2E trong lượt này.
- [x] Kiểm tra bundle Workers bằng build dry-run trên Windows (04/11/2026): wrangler deploy --dry-run --env dev --outdir dist đạt, bundle 1058.15 KiB / gzip 189.28 KiB; không deploy cloud. Frontend build đạt, tạo service worker và precache 23 mục; chunk chính 521.79 kB còn cảnh báo, sync-storage còn cảnh báo import tĩnh/động.
- [x] Cập nhật README theo hiện trạng P10, đường dẫn dự án, cách chạy và các giới hạn (04/11/2026); đã chạy lại cài đặt/khởi động native và Docker. Có bảng nghiệm thu môi trường trong README; bootstrap database trống chưa chạy lại.
- [x] Phân biệt rõ database Windows native, Docker, test và cloud trong README; giải thích tài khoản không tự chuyển giữa các database và dữ liệu trình duyệt tách theo origin.
- [x] Ghi cách mở/tắt tunnel và xử lý URL thay đổi, cookie, origin và Passkey trong README; ghi rõ Pinggy là script riêng, không phải Cloudflare.

### Điều kiện đóng phase

- [x] Làm theo README có thể chạy lại và kiểm tra trên Windows/Docker (04/11/2026): Windows npm ci/runtime/migrate/dev và UI login/setup bằng Edge đạt; Docker build/stop/up, setup, đăng nhập admin, kiểm tra cookie phiên và đăng xuất đạt. Số lượng users/transactions và schema giữ nguyên, đã khôi phục Docker/tunnel. README ghi rõ môi trường chưa kiểm chứng, thiếu bundled Chromium và giới hạn iPhone/cloud; không coi các phần này đã nghiệm thu.
- [x] Các lệnh kiểm tra bắt buộc đạt, có môi trường/ngày/kết quả; không còn lỗi import contracts do đường dẫn cũ. Bằng chứng nghiệm thu ngay bên dưới; npm run check đạt mã 0 sau cài lại dependencies bằng npm ci.

### Bằng chứng đóng N00 — 04/11/2026

Môi trường: Windows x64, PowerShell, Node v24.21.0, npm 11.19.0; thư mục `C:\Users\User\Documents\income_expenditure\qualythuchi`. Lệnh tổng hợp chạy từ 10:31 đến 10:32, múi giờ +07:00. Chạy ngoài sandbox với quyền được cấp để Wrangler ghi log/đọc cấu hình; không thay đổi mã nguồn hay deploy cloud để làm kiểm tra đạt.

| Kiểm tra | Kết quả |
|---|---|
| `npm.cmd ls --workspaces --depth=0` | Mã 0; backend/frontend/contracts trỏ về apps/backend, apps/frontend, packages/contracts trong thư mục hiện tại |
| `Get-ChildItem node_modules/@thu-chi` (Name/LinkType/Target) | Ba Junction đúng, không trỏ về Documents/qualythuchi cũ |
| `npm.cmd run check` | **Mã 0**, chạy liền mạch lint → typecheck → test → build |
| `npm run lint` qua check | Đạt, không có lỗi ESLint |
| `npm run typecheck` qua check | Đạt backend, frontend, contracts và tsconfig.tests.json; không có TS2307/import contracts |
| `npm test` qua check | 76/76 Vitest; config 17/17, auth 17/17, finance 4/4, admin 4/4, budgets 6/6, notifications 7/7, P10 2/2; tổng 133 đạt |
| Workers build qua check | Dry-run env dev đạt, bundle 1058.15 KiB / gzip 189.28 KiB; không deploy |
| Frontend/PWA build qua check | Đạt; tạo sw.js, workbox và precache 23 mục |

Cảnh báo còn lại không làm fail check: chunk frontend chính 521.79 kB, sync-storage có import tĩnh/động và Node experimental loader trong một số test. 28 vấn đề dependencies do npm audit báo trong bước cài đặt trước đó vẫn chưa xử lý; npm run check không bao gồm audit. E2E và kiểm thử iPhone/cloud chưa được nghiệm thu bằng kết quả này.

## 5. N01 — Nghiệm thu nghiệp vụ cốt lõi và phân quyền

### Đã có mã nguồn và kiểm thử tự động

- [x] Đăng nhập username/password, cookie phiên, CSRF, giới hạn thử đăng nhập và route guard.
- [x] Sửa việc mở lần đầu chưa có cookie bị hiển thị thành lỗi; vẫn kiểm tra cookie sau đăng nhập.
- [x] Vai trò USER/SUPER_ADMIN; backend kiểm tra ownerUserId và chặn truy cập chéo trái phép.
- [x] Ví, số dư ban đầu, danh mục mặc định/tự tạo, kiểm tra trùng tên và ràng buộc xóa.
- [x] Thu/chi có ví, danh mục, ngày giờ, ghi chú, nhãn; sửa/xóa và undo 10 giây.
- [x] Chuyển ví nguyên tử, chống trùng và không tính chuyển ví vào tổng thu/chi.
- [x] Dashboard số dư/thu/chi, ngân sách và hoạt động gần đây.
- [x] Ngân sách tổng tháng/danh mục, tính mức sử dụng và sự kiện ngưỡng 80%/100% có dedupe.
- [x] Tìm kiếm có bộ lọc và báo cáo có biểu đồ, tổng hợp, truy vấn theo owner/timezone.
- [x] Admin quản lý tài khoản, khóa/kích hoạt, đổi mật khẩu/vai trò và xem audit.
- [x] Giao diện Admin quản lý giao dịch, ví và ngân sách của User được chọn.
- [x] Mục tiêu tiết kiệm, khoản đóng góp và mốc tiến độ.
- [x] Lịch định kỳ ngày/tuần/tháng; chỉ ghi giao dịch khi xác nhận, xác nhận lặp không ghi trùng.

### Còn làm

- [x] Chạy E2E hiện có, dashboard và kéo xuống tải lại trên Chromium/WebKit với Workers/D1 test thật, lưu báo cáo (04/11/2026): 50 đạt, 2 bỏ qua theo cấu hình, 0 lỗi/flaky. Các bài health/auth-runtime/finance/Passkey/dashboard dùng API thật; 2 bài dashboard có chèn lỗi vận chuyển và auth.spec.ts còn fixture auth để thử trạng thái UI/lỗi. Xem bằng chứng bên dưới, không coi mọi bài trong suite đều không có mock.
- [x] Đối chiếu FR-09/SCR-02 và bổ sung hai thành phần dashboard còn thiếu (04/11/2026): tối đa 3 khoản chi định kỳ đang hoạt động gần hạn, ưu tiên quá hạn, theo múi giờ từng lịch; tối đa 3 mục tiêu ACTIVE với số đã dành/đích, phần trăm và thanh tiến độ. Có liên kết sang định kỳ/tiết kiệm, ẩn số tiền theo nút ẩn số dư, tải/rỗng/lỗi độc lập và đọc cache sync theo tài khoản. 4/4 E2E dashboard mới trên Chromium/WebKit dùng API thật đạt; 4/4 unit test về lọc/sắp xếp/múi giờ/tiến độ đạt. Không thay đổi ledger khi chỉ xem dashboard.
- [ ] Rà độ phủ quản trị theo yêu cầu toàn quyền: danh mục, tiết kiệm, lịch định kỳ và các tác vụ chưa có UI Admin tương ứng; ghi rõ API/UI nào còn thiếu và hoàn thiện phần thuộc phạm vi.
- [ ] Đối chiếu cùng dữ liệu giữa ví, dashboard, ngân sách, tìm kiếm và báo cáo, gồm giao dịch sát biên ngày/tháng và khác múi giờ.
- [ ] Kiểm chứng undo 10 giây nhất quán giữa API trực tiếp, hàng đợi sync và thiết bị thật.
- [ ] Kiểm thử đổi tài khoản, khóa tài khoản, đổi vai trò/mật khẩu và thu hồi phiên trên nhiều tab/thiết bị.
- [ ] UAT nhập/sửa/xóa/chuyển ví và báo cáo trên Safari/PWA iPhone.
- [ ] Chốt tiêu chí tốc độ nhập giao dịch để đo UAT; chưa có mức thời gian được xác nhận.
- [x] Sửa nút Thêm trên màn hình Giao dịch bị xuống dòng chữ cuối (04/11/2026): header dùng grid với cột hành động tự định cỡ, nhãn không xuống dòng/icon không co; màn hình dưới 381 px tách hàng tiêu đề. Đã đo chữ đầu/cuối cùng hàng, nút nằm trong viewport và không tràn ngang trên Chromium/WebKit ở 320/360/390/430 px. Ảnh lưu tại `.preview/e2e/transactions-layout-20261104/`; đã cập nhật frontend Docker.
- [x] Rà mã nguồn và sửa căn giữa 9 vị trí hộp thoại (04/11/2026): giao dịch, ví, danh mục, ngân sách, đăng xuất, tài khoản quản trị và 3 form tài chính theo User. Dùng chung useModalDialog/showModal và CSS căn giữa theo visualViewport, xử lý vùng nhìn thấy khi mở bàn phím và cuộn nội dung dài; loại bỏ cơ chế open không modal/tọa độ riêng mâu thuẫn. Không chạy test hoặc browser automation cho bản sửa này theo yêu cầu người dùng; các số liệu E2E bên dưới là bằng chứng của lượt trước, chưa xác nhận lại popup trên iPhone.
  - Áp dụng: Docker frontend build (TypeScript + Vite/PWA) đạt, container frontend healthy. Đây là kết quả biên dịch/khởi chạy, không phải kiểm thử hành vi popup; không thay đổi dữ liệu tài chính.
- [x] Thêm kéo xuống tải lại trang (04/11/2026): dùng chung RootLayout, một ngón ở đầu trang, vượt ngưỡng rồi thả reload đúng URL một lần; có nhãn kéo/thả/đang tải. Hủy khi kéo ngắn/đổi hướng/đổi route/touchcancel, không chiếm vuốt ngang, đa chạm, vùng cuộn riêng, trường nhập đang focus hoặc dialog mở. 3/3 unit test gesture và 6/6 E2E riêng Chromium/WebKit đạt; Chromium dùng Input CDP thật, WebKit phát sự kiện DOM cho handler, chưa thay thế kiểm thử cảm ứng iPhone thật. Ảnh/báo cáo riêng tại `.preview/e2e/pull-refresh-targeted-20261104/`.

### Bằng chứng E2E — 04/11/2026

- Môi trường: Windows x64, Node 24.21.0, npm 11.19.0, Playwright 1.64.1; Chrome for Testing 156.0.8078.4 / Chromium build 1248 và WebKit 27.2 build 2370. Dùng viewport iPhone 13, không phải iPhone thật.
- Lệnh: `npm.cmd run test:e2e -- --workers=1`, mã 0. Lượt cuối bắt đầu 11:29:48 +07:00, thời lượng báo cáo 130,7 giây; 52 trường hợp, 50 đạt/2 bỏ qua, không retry/flaky. Thay thế lượt 11:17 (44 đạt/2 bỏ qua) trước khi thêm kéo xuống tải lại.
- Máy chủ: Workers local cổng 8788, APP_ENV=test, D1 trong `apps/backend/.wrangler/test`; frontend build/preview cổng 4173. Migration và seed test được chạy trước test; không thay đổi tài khoản/database Docker dev. Health dev cổng 5173 vẫn ok sau kiểm tra.
- Chromium: 26 đạt. WebKit: 24 đạt, 2 bỏ qua sẵn trong spec: offline service worker kiểm chứng tự động bằng Chromium; Passkey virtual authenticator dùng Chromium CDP. Cả hai vẫn cần nghiệm thu Safari/PWA iPhone riêng. Kéo xuống tải lại được thử qua Input CDP trên Chromium và sự kiện DOM trên WebKit.
- Phân loại 50 bài đạt: 17 bài có API thật (health/CORS, auth-runtime, CRUD ví/danh mục, Passkey và dashboard; 2 bài dashboard chèn lỗi API định kỳ để kiểm tra cô lập lỗi, auth/tiết kiệm vẫn thật); 18 bài auth UI/error fixtures trong auth.spec.ts; 15 bài nền tảng/router/PWA/cử chỉ kéo xuống. Không dùng fixture UI làm bằng chứng phân quyền server.
- Báo cáo: [HTML](../playwright-report/index.html), [JSON](../test-results/e2e-results.json). Ảnh/trace bài lỗi của các lượt trước lưu dưới `.preview/e2e/20261104-initial`, `20261104-second`, `20261104-third`; các lượt probe Passkey cũng nằm trong `.preview/e2e/`. Đây là artifact local được Git/ESLint ignore, không phải tài liệu nguồn được commit.
- Đọc HTML bằng `npx.cmd playwright show-report playwright-report`; trace lỗi mở bằng `npx.cmd playwright show-trace <duong-dan-trace.zip>`.
- Bản sao lượt đạt trước dashboard giữ ở `.preview/e2e/20261104-final/`; bản có dashboard mới giữ ở `.preview/e2e/dashboard-final-20261104/` (gồm playwright-report và test-results) để không mất khi test tiếp theo ghi đè báo cáo mặc định.
- Lượt mới nhất có kéo xuống tải lại được giữ tại `.preview/e2e/pull-refresh-final-20261104/`; ảnh trạng thái kéo/thả nằm trong test-results của bản sao này. Unit gesture 3/3, lint/typecheck toàn dự án và npm test (84 Vitest + 57 backend/config) đạt. Build frontend/PWA đạt, chunk chính 531,44 kB còn cảnh báo; đã cập nhật frontend Docker và kiểm tra health local.
- Đã sửa test lỗi thời: version IndexedDB, nhãn form, nội dung phiên, offline chưa xác minh được auth; tách fixture khỏi service worker, đóng thông báo PWA trước thao tác bị che. CRUD tài chính chuyển từ auth giả lập sang đăng nhập/API thật, tên dữ liệu test riêng và dọn dữ liệu sau thành công.
- Đã sửa proxy local giữ origin loopback theo CORS allowlist để WebAuthn kiểm tra đúng origin trình duyệt; Passkey E2E dùng localhost xuyên suốt vì RP ID cần hostname. API test vẫn kiểm tra origin lạ bị 403; header Set-Cookie thực tế phải có HttpOnly/SameSite=Lax trên cả hai engine, kiểm tra metadata cookie riêng trên Chromium.
- Sau bổ sung dashboard: lint/typecheck toàn dự án đạt; npm test đạt 81 Vitest + 57 backend/config; unit dashboard 4/4 đạt. Frontend build/PWA và cập nhật Docker đạt, chunk chính 528,14 kB còn cảnh báo; không deploy cloud. Kết nối IndexedDB của adapter đóng khi tab khác yêu cầu đổi version/xóa DB, và kết nối mở muộn sau lỗi blocked cũng được đóng; E2E dọn dữ liệu/đăng xuất nhiều tab và bài cố tình giữ kết nối ngoài adapter đều đạt.

### Điều kiện đóng phase

- [ ] USER chỉ thấy dữ liệu mình; Admin thao tác đúng tài khoản đích và có audit theo phạm vi đã chốt.
- [ ] Thu/chi, số dư và báo cáo khớp dữ liệu mẫu, không đếm chuyển ví thành thu/chi.
- [ ] E2E và UAT đạt; các phần UI còn thiếu đã hoàn thiện hoặc được xác nhận tách phạm vi.

**Giới hạn đã biết:** khoản đóng góp tiết kiệm hiện chỉ theo dõi tiến độ, không tự trừ ví. Không tự thêm tính năng trừ ví khi chưa chốt quy tắc để tránh đếm tiền hai lần. Luồng chuyển ví hiện hỗ trợ tạo, không mặc định có sửa/xóa chuyển ví đã ghi sổ.

## 6. N02 — Hoàn thiện offline và xử lý xung đột

### Đã có

- [x] IndexedDB riêng theo tài khoản; bản ghi và outbox được cập nhật trong cùng transaction.
- [x] Hàng đợi ghi thu/chi và tạo chuyển ví; trạng thái pending/syncing/synced/error.
- [x] Push/pull theo owner, cursor/revision, batch nguyên tử và khóa chống gửi trùng.
- [x] Retry sau mất phản hồi; phát hiện sửa trên phiên bản cũ thay vì ghi đè ngầm.
- [x] Pull ví, danh mục, giao dịch, chuyển ví, ngân sách, tiết kiệm và lịch định kỳ.
- [x] Trang trạng thái sync và giữ riêng thay đổi chưa đồng bộ khi đăng xuất.

### Còn làm

- [ ] Chốt cách xử lý xung đột khi User/Admin cùng sửa: ai quyết định, giữ bản nào, khi nào gửi lại.
- [ ] Thiết kế và triển khai UI xử lý xung đột theo quyết định đã chốt; không đánh dấu giữ bản lỗi là đã giải quyết xung đột.
- [ ] Công bố ma trận online/offline từng thao tác; không hứa mọi tính năng đều ghi offline được.
- [ ] Kiểm thử nhiều chỉnh sửa liên tiếp, delete/undo, mất mạng giữa push và phản hồi, reload khi còn outbox.
- [ ] Kiểm thử Admin sửa trong khi User offline, sau đó User kết nối lại.
- [ ] Kiểm thử đăng xuất/đổi tài khoản khi còn outbox, đồng thời nhiều tab và phiên hết hạn.
- [ ] Xác định và kiểm chứng khả năng mở lại PWA offline; không đồng nhất cache giao diện với đăng nhập offline.
- [ ] Kiểm tra số liệu local/server sau sync và thông báo rõ khi báo cáo chưa gồm thay đổi đang chờ.

### Điều kiện đóng phase

- [ ] Không mất thay đổi trong các tình huống hỗ trợ, không tạo bản ghi trùng và không rò dữ liệu giữa tài khoản.
- [ ] Có cách xử lý xung đột thực tế; người dùng hiểu dữ liệu nào chưa lên máy chủ.
- [ ] Các kịch bản mất mạng/đóng mở lại đạt trên iPhone và có bằng chứng.

## 7. N03 — Backup/restore Google Drive mã hóa

### Đã có nền tảng

- [x] Quyết định dùng một Google Drive do Super Admin sở hữu, tách dữ liệu từng User; User không cần kết nối Drive riêng.
- [x] Dữ liệu tài chính đã đồng bộ tập trung trong D1 để làm đầu vào backup theo phạm vi được chốt.

### Còn làm

- [ ] Chốt lịch/kích hoạt backup, số phiên bản/thời gian lưu và xử lý quota.
- [ ] Chốt quản lý recovery key, quyền giải mã/restore của User và Super Admin.
- [ ] Chốt restore thay thế hay hợp nhất, cách xử lý dữ liệu mới và outbox chưa gửi; không tự chọn thay người dùng.
- [ ] Thiết kế archive có phiên bản, phạm vi dữ liệu, kiểm tra toàn vẹn và migration khi khôi phục.
- [ ] Tích hợp OAuth Google Drive phía backend; không đưa token Drive vào frontend.
- [ ] Tạo archive mã hóa theo tài khoản, metadata và lịch sử backup.
- [ ] UI tạo/xem backup, tình trạng thất bại, thiếu khóa và xác nhận restore.
- [ ] Restore có kiểm soát quyền, audit, xử lý lỗi giữa chừng và đồng bộ thiết bị sau restore.
- [ ] Test sai khóa, archive hỏng, lỗi mạng/quota, backup A không lẫn B và User không restore dữ liệu người khác.
- [ ] Diễn tập khôi phục trên thiết bị khác và sau khi xóa dữ liệu Safari.

### Điều kiện đóng phase

- [ ] Backup đã mã hóa và một bản backup thực sự khôi phục được đầy đủ vào môi trường kiểm tra.
- [ ] Có quy trình quản lý khóa/phiên bản; restore không làm mất dữ liệu mới ngoài phạm vi đã xác nhận.
- [ ] Lưu bằng chứng restore drill; có file backup mà chưa thử restore chưa đủ đóng phase.

## 8. N04 — Thông báo, Passkey và phục hồi truy cập

### Đã có

- [x] Inbox, trạng thái đã đọc, cài đặt và đăng ký/hủy push.
- [x] VAPID, mã hóa subscription; scheduler có chống trùng, thử lại có giới hạn và vô hiệu endpoint hết hạn.
- [x] Cấu hình Workers Cron mỗi 15 phút và kiểm tra giờ địa phương 21:00.
- [x] Nhắc chung mở app hằng ngày, nhắc định kỳ trước hạn một ngày/đúng ngày.
- [x] Sự kiện mốc tiết kiệm; mặc định gần hạn 7 ngày và tổng kết Chủ nhật 21:00, fallback Asia/Bangkok.
- [x] API/UI Passkey, challenge có hạn dùng và dùng một lần, ràng buộc origin/RP ID.
- [x] Admin có thể đặt lại mật khẩu; mật khẩu lưu dạng băm, không đọc lại được.

### Còn làm

- [ ] Đối chiếu yêu cầu tổng kết cuối ngày với quyết định chỉ push nhắc mở app: chốt nội dung hiển thị trong app/push và dữ liệu có thể đưa ra màn hình khóa.
- [ ] Hoàn thiện tổng kết thu/chi 21:00 và điều kiện nhắc khi chưa ghi giao dịch theo phạm vi được chốt; hiện scheduler mới nhắc chung.
- [ ] Kiểm chứng cảnh báo ngân sách từ event đến inbox/push đúng phạm vi, không suy ra push đã giao từ việc có event.
- [ ] Xác minh cấu hình push thực trên môi trường test/production và scheduler thực sự chạy; tunnel tới local không chứng minh cron nền đã hoạt động.
- [ ] UAT iPhone PWA đã Add to Home Screen: cấp/thu hồi quyền, đóng app, đổi múi giờ, nhiều thiết bị.
- [x] Chạy E2E Passkey Chromium với virtual authenticator, API Workers/D1 test thật: đăng ký, liệt kê, đăng xuất/đăng nhập lại, xác minh phiên và xóa credential test; lượt tổng hợp 04/11/2026 đạt. WebKit không có bài virtual authenticator tương đương trong suite hiện tại.
- [ ] Đăng ký/đăng nhập Passkey thật trên iPhone cùng origin ổn định.
- [ ] Chốt quy trình mất Passkey/quên mật khẩu; hoàn thiện hướng dẫn hoặc UI/API cần thiết. Không mặc định phải có reset công khai qua email.
- [ ] Chốt và kiểm chứng bootstrap Super Admin đầu tiên trên production; CLI hiện giới hạn local dev/test.

### Điều kiện đóng phase

- [ ] Thông báo đúng điều kiện/múi giờ, không lặp; ghi nhận giới hạn delivery và dữ liệu chưa sync.
- [ ] Passkey và phục hồi truy cập đã kiểm chứng; không cam kết Face ID cụ thể hoặc push chính xác từng giây.

## 9. N05 — OCR hóa đơn

### Đã có nền tảng

- [x] Form/API ghi giao dịch thủ công để tiếp nhận dữ liệu sau kiểm tra.

### Còn làm

- [ ] Chốt xử lý hóa đơn mờ, thiếu tiền/ngày, nhiều số tiền và không nhận diện được; luôn có nhập tay.
- [ ] UI chụp/chọn ảnh, xử lý hướng ảnh và trạng thái nhận diện.
- [ ] Tích hợp OCR, đo độ chính xác/hiệu năng tiếng Việt trên iPhone.
- [ ] Hiển thị gợi ý số tiền/ngày/nội dung, cho sửa và chọn ví/danh mục trước khi xác nhận.
- [ ] Chỉ tạo giao dịch sau xác nhận; kiểm thử retry không ghi trùng và xử lý dữ liệu ảnh theo chính sách đã chốt.

### Điều kiện đóng phase

- [ ] Có bộ hóa đơn mẫu và kết quả đo; nhận diện sai/không được vẫn ghi tay được, không tự ghi sổ.

## 10. N06 — Xuất báo cáo PDF

### Đã có nền tảng

- [x] API tìm kiếm/báo cáo có kiểm tra owner và dữ liệu tổng hợp.

### Còn làm

- [ ] UI chọn thời gian, ví/bộ lọc và nội dung xuất.
- [ ] Tạo PDF có font tiếng Việt, bảng/tổng và biểu đồ phù hợp.
- [ ] Tải/chia sẻ trên Safari/PWA iPhone, xử lý báo cáo rỗng/lớn.
- [ ] Kiểm thử số liệu và múi giờ khớp báo cáo; User không xuất dữ liệu người khác, Admin xuất đúng tài khoản đích.

### Điều kiện đóng phase

- [ ] File mở/chia sẻ được trên iPhone, không lỗi dấu tiếng Việt và khớp tổng giao dịch theo bộ lọc.

## 11. N07 — CI/cloud, UAT cuối và phát hành

### Đã có cấu hình

- [x] GitHub Actions CI chạy lint/typecheck/test/build và Playwright Chromium/WebKit.
- [x] Workflow preview và rollback preview, script kiểm tra version/health.
- [x] Cấu hình Workers dev/test/prod, D1, assets production và hướng dẫn triển khai.
- [x] Kiểm tra chống nhầm môi trường/ID mẫu trong công cụ cloud.

### Còn làm

- [ ] Xác minh tài nguyên cloud, bindings, secrets và origin thực; không coi có ID trong cấu hình là đã deploy đúng.
- [ ] Chạy CI trên commit xác định, lưu URL run, artifact và kết quả E2E.
- [ ] Deploy preview HTTPS thật; ghi version và database/migration đã kiểm tra.
- [ ] Diễn tập deploy A → B → rollback A; kiểm tra Worker/assets, API và cập nhật PWA. Rollback code không khôi phục D1.
- [ ] Kiểm tra tương thích migration với phiên bản rollback và quy trình phục hồi database.
- [ ] Đo hiệu năng iPhone, xem xét chunk chính trên 500 kB; tối ưu theo kết quả đo.
- [ ] UAT đủ vai trò: online/offline, đổi tài khoản, sync, ngân sách, báo cáo, tiết kiệm, định kỳ, push và Passkey.
- [ ] Nghiệm thu Add to Home Screen, đóng/mở lại, service worker cập nhật và giữ form chưa lưu.
- [ ] Kiểm tra cấu hình production, quota, logging/giám sát và quy trình xử lý sự cố.
- [ ] Hoàn tất N03 và restore drill trước khi coi là bản dùng lâu dài cho dữ liệu quan trọng.
- [ ] Ghi các tính năng N05/N06 còn tách release nếu có; việc tách phải được xác nhận, không đánh dấu hoàn thành thay.
- [ ] Nếu muốn deploy tự động production: chốt quy trình và bổ sung workflow; hiện chỉ có workflow preview/rollback preview.

### Điều kiện đóng phase

- [ ] Có URL production ổn định, version/commit, health/schema, tài khoản bootstrap và biên bản nghiệm thu thực tế.
- [ ] Có bằng chứng CI, iPhone UAT, rollback và restore; mọi lỗi tồn đọng có người xử lý/phạm vi rõ ràng.

## 12. Quyết định còn mở và giới hạn phạm vi

| Nội dung | Hiện trạng | Cần chốt / xử lý ở |
|---|---|---|
| Xung đột Admin–User | Đã phát hiện; chưa có UI giải quyết hoàn chỉnh | N02 |
| Lịch backup, retention, recovery key, restore | Chưa hoàn thiện chính sách | N03 |
| Tổng kết 21:00 so với push nhắc mở app | Có nhắc chung; cần đối chiếu quyết định về riêng tư/nội dung | N04 |
| Gần hạn tiết kiệm/tổng kết tuần | Mặc định P10: 7 ngày, Chủ nhật 21:00 | Giữ mặc định khi chưa có thay đổi được xác nhận |
| Phục hồi tài khoản và bootstrap production | Local có CLI; Admin có đổi mật khẩu | N04 |
| Tiêu chí tốc độ nhập giao dịch | Chưa có mục tiêu đo được | N01/N07 |
| OCR sai/không nhận diện | Chưa chốt chi tiết | N05 |
| Sign in with Apple | Phương thức bổ sung, phụ thuộc điều kiện triển khai | Backlog riêng; không thay username/password |
| Liên kết đóng góp tiết kiệm với ví | Hiện không tự thay đổi số dư | Không tự bổ sung trước khi chốt quy tắc |
| Nhập lịch sử từ MISA | Câu hỏi mở, chưa xác nhận triển khai | Không tự thêm vào phạm vi các phase trên |

## 13. Cách ghi nhận hoàn thành từ đây

1. Làm theo phase đang ưu tiên; có thể kiểm thử CI/iPhone sớm theo dependency.
2. Mỗi thay đổi ghi rõ FE, BE, DB, phân quyền và tác động offline nếu có.
3. Test với tài khoản/dữ liệu thử; không dùng production để thử luồng phá hủy/restore.
4. Khi một mục đạt, đổi checkbox và ghi bằng chứng: lệnh, môi trường, ngày, kết quả hoặc URL run/biên bản.
5. Không đóng phase chỉ vì API/UI đã tồn tại; phải đạt điều kiện cuối phase.
6. Cập nhật kế hoạch này và phần nghiệp vụ liên quan trong AGENTS.md; không cần tạo thêm file Markdown chỉ để chia lại phase.

Tài liệu đối chiếu: [AGENTS.md](../AGENTS.md), [yêu cầu nghiệp vụ](./quan-ly-thu-chi-requirements.md), [đặc tả](./quan-ly-thu-chi-project-specification.md), [thiết kế](./quan-ly-thu-chi-system-design.md), [báo cáo P10](./P10-report.md), [biên bản P00](./p00-acceptance.md), [hướng dẫn production](./cloudflare-production-deployment.md).
