# Kế hoạch triển khai theo Phase — Ứng dụng quản lý thu chi PWA

> Phiên bản kế hoạch: 1.0 — 22/10/2026  
> Tài liệu đầu vào: `design/screen-inventory.md`, `requirements/quan-ly-thu-chi-requirements.md`, `specifications/quan-ly-thu-chi-project-specification.md`, `design/quan-ly-thu-chi-system-design.md`.  
> **Trạng thái:** Kế hoạch triển khai **đề xuất**, không phải thay đổi yêu cầu nghiệp vụ đã chốt.  
> Mục tiêu: **mỗi phase đều có phần frontend, backend (nếu cần), database, test tự động/thủ công, tiêu chí hoàn thành**. Không đợi code xong toàn bộ mới test.

## 1. Nguyên tắc và công nghệ xuyên suốt

- **Tài liệu theo phase:** không tạo thêm file Markdown trong lúc triển khai. Khi hoàn thành phase, tổng hợp phạm vi, thay đổi, kết quả kiểm thử và việc còn lại vào một file duy nhất của phase đó.
- **Frontend:** React + TypeScript + Vite, Tailwind CSS + shadcn/ui, Zustand, React Hook Form + Zod, PWA/Workbox, IndexedDB + Dexie.
- **Backend:** Cloudflare Workers (API, RBAC, đồng bộ, thông báo), Cloudflare D1 (tài khoản, session, dữ liệu tài chính đồng bộ, audit, metadata).
- **Tích hợp:** WebAuthn/Passkey; Web Push + Workers Cron; Google Drive **của Super Admin** để backup archive mã hóa có phiên bản. Sign in with Apple là tích hợp bổ sung còn phụ thuộc điều kiện Apple Developer.
- **Kiểm thử:** Vitest + React Testing Library, Workers tests (Miniflare hoặc môi trường test tương thích), Playwright E2E và kiểm thử thực tế bằng Safari/PWA trên iPhone iOS 26+.
- **Nguyên tắc giá:** ưu tiên free tier, nhưng phải kiểm tra quota thực tế Workers/D1/Drive và chi phí, không cam kết luôn 0đ. Backend phải có secret/config riêng, không nhúng Google Drive token vào PWA.
- **Dữ liệu:** giá trị VND số nguyên; số dư ban đầu; cho phép số dư âm; chuyển tiền không tính thu/chi; User chỉ truy cập dữ liệu mình, Super Admin thao tác mọi tài khoản.
- **Offline-first:** ghi vào IndexedDB, giữ hàng đợi outbox; khi online push lên server, pull thay đổi server xuống client. Thay đổi chưa sync **không** thể được Super Admin nhìn thấy.
- **Phương pháp làm:** frontend có mock API trong lúc backend triển khai; trước khi chốt phase phải chạy bài test FE + BE + E2E bằng API thật. Không đánh dấu `Done` chỉ vì đã dựng xong UI.
- **Các điểm chưa chốt:** cách xử lý conflict đồng sửa, bootstrap Super Admin đầu tiên, quên mật khẩu, lịch/retention backup và quản lý recovery key; xem mục 6. Chỉ triển khai hoàn chỉnh phần phụ thuộc sau khi có quyết định, không tự quyết định thay.

## 2. Tổng quan 12 phase (theo dependency, không phải theo thời lượng)

| Phase | Mục tiêu bàn giao chạy được | Màn hình SCR | FE | BE / Database | Trọng tâm test |
|---|---|---|---|---|---|
| **P00** | Khởi tạo dự án, CI, deploy preview | Khung UI | Setup PWA, router, theme, shell | Workers, D1 migration, health API, môi trường | Build, smoke, lint/typecheck |
| **P01** | Đăng nhập và phân quyền thật | 01, 17 (một phần), 18–19 (nền) | Login/logout, guard, trạng thái phiên | Username/password, session, RBAC, admin bootstrap* | Auth, 401/403, session/cross-account |
| **P02** | CRUD ví và danh mục | 06, 08 | Danh sách/form, validation | CRUD + ownerUserId, migration | CRUD, quyền, ràng buộc xóa |
| **P03** | Thu/chi cốt lõi | 03, 04 | Danh sách, tạo/sửa/xóa, undo 10 giây | Transaction API, invariant số tiền | Số dư, undo, idempotency API |
| **P04** | Chuyển ví + Dashboard cơ bản | 07, 02 (phần lõi) | Transfer form, thẻ số dư/thu chi/giao dịch | Transfer atomic, summary API | Không tính transfer vào thu/chi |
| **P05** | Offline và đồng bộ 2 chiều | 16 (sync), 20 (nền) | Dexie, outbox, sync status, retry | Push/pull, cursor/revision, RBAC, audit | Offline, retry, conflict* |
| **P06** | Super Admin quản lý dữ liệu các User | 18, 19, 20, 21 | Chọn User, CRUD theo owner, audit view | Admin API, audit log, account ops* | User không vượt quyền, admin edits sync |
| **P07** | Ngân sách và cảnh báo | 09, 02 (bổ sung) | Budget form/progress, cảnh báo | Budget API, threshold events/dedupe | 80%/100%, không trùng |
| **P08** | Thông báo nền + bảo mật truy cập | 15, 17 (hoàn thiện) | Push opt-in, passkey UX, inbox | Web Push/VAPID, cron, passkey API | iPhone installed PWA, giờ 21:00, khóa |
| **P09** | Tìm kiếm, báo cáo | 13, 10, 02 (hoàn thiện) | Filter, chart, navigation | Query filters, aggregation API | Lọc đúng owner, tổng đúng, timezone |
| **P10** | Tiết kiệm, định kỳ, nhắc hóa đơn | 11, 12, 15 (bổ sung) | Goals, recurring, confirm | Goal/recurring API, scheduler | Không ghi kỳ trước xác nhận |
| **P11** | Sao lưu Drive, OCR và PDF + UAT | 16 (backup), 05, 14 | Backup/restore UX, OCR, PDF | Drive proxy/worker, archive, restore* | Khôi phục, bảo mật, OCR, PDF, regression |

`*`: có phần **blocker chưa được xác nhận**; xem mục 6. Một phase có thể chia thành nhiều PR nhỏ; chỉ nghiệm thu khi các dependency đã chốt và test xong.

### Phân nhóm ưu tiên (không thay đổi mức ưu tiên yêu cầu)

- **Cốt lõi:** P00–P08 (những phần ngân sách, thông báo và Super Admin liên quan); thao tác backup an toàn ở P11 là yêu cầu cốt lõi nên có thể tách **P11A — Backup** đưa lên trước P09 nếu cần nghiệm thu sớm.
- **Cao:** P09–P10 (tìm kiếm, báo cáo, tiết kiệm, định kỳ).
- **Trung bình:** **P11B — OCR và PDF** sau backup; không để tính năng OCR/PDF cản bàn giao cốt lõi.
- Việc đặt P11 cuối bảng thể hiện gom hạng mục tích hợp; **không có nghĩa được bỏ backup khỏi bản cốt lõi**.

## 3. Checklist chi tiết theo phase

### P00 — Foundation, môi trường, quy trình kiểm thử
**Mục tiêu:** frontend và backend chạy độc lập lẫn tích hợp qua URL dev/preview.

- **FE (code đã triển khai, chờ nghiệm thu):** [x] Vite React TS, Tailwind, shadcn/ui, router, bố cục PWA; [x] manifest và service worker cache phần app shell; [x] trang lỗi/offline; [x] config API base URL theo env. Xem [trạng thái và kiểm thử frontend](p00-acceptance.md#frontend). Các dấu chọn này chỉ ghi nhận phần code, không đánh dấu P00 Done.
- **BE (code/cấu hình đã triển khai, chờ runtime/cloud nghiệm thu):** [x] Cloudflare Workers dự án; [x] D1 binding và migration đầu; [x] `GET /api/health`; [x] CORS allowlist, quản lý secret và cấu hình dev/test/prod riêng. Xem [trạng thái backend](p00-acceptance.md#backend). Database ID cloud vẫn là placeholder, chưa tạo/deploy tài nguyên cloud hoặc đánh dấu P00 Done.
- **Test (đã cấu hình CI/E2E/preview/rollback, chờ chạy thực và bằng chứng):** [ ] lint/typecheck/unit chạy CI; [ ] FE mở được trên iPhone Safari; [ ] API health trả đúng; [ ] deploy preview rollback được. Xem [hướng dẫn chạy](p00-acceptance.md#ci-preview) và [biên bản nghiệm thu](p00-acceptance.md).
- **Done:** FE và BE triển khai được theo một quy trình có thể lặp lại; không có secret trong repo.

### P01 — Authentication + RBAC
**Màn hình:** `SCR-01`, `SCR-17` (phần session/passkey đến P08), nền cho `SCR-18/19`.

- **FE (code đã hoàn thành, chờ tích hợp API auth thật và nghiệm thu đầy đủ):** [x] Login username/password; [x] trạng thái lỗi; [x] protected routes; [x] logout/xóa cache dữ liệu người trước khi đổi tài khoản; [x] giao diện role-aware.
- **BE (code đã triển khai, chờ nghiệm thu Workers/FE–BE đầy đủ):** [x] D1 users/roles/sessions; [x] hash mật khẩu theo thuật toán an toàn phù hợp Workers; [x] `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`; [x] middleware auth & `ownerUserId`; [x] cơ chế tạo Admin đầu tiên: chốt CLI chạy một lần cho D1 local (`docker compose exec backend npm run auth:bootstrap -- --local dev`), nhập mật khẩu ẩn, chỉ tạo `SUPER_ADMIN` khi database chưa có tài khoản. Chưa tạo tài khoản thực do phiên làm việc không có quyền truy cập Docker Engine; chưa bật bootstrap remote/production.
- **Test (đã có kiểm thử cho cả 5 mục; 16 auth test native đạt, test Hono/E2E chưa chạy trong phiên này):** [x] sai mật khẩu; [x] hết hạn/thu hồi session; [x] User gọi admin endpoint → 403; [x] giả mạo `ownerUserId` → 403; [x] cookie/token bảo vệ CSRF/XSS phù hợp.
- **Done:** login User và Admin bằng API thật; session không rò rỉ khi đổi tài khoản.
- **Chặn:** cần chạy CLI để tạo Admin local và nghiệm thu đăng nhập thực; quy trình bootstrap remote/production và reset password chưa chốt, không tự phát hành bootstrap vào production.

### P02 — Danh mục và ví
**Màn hình:** `SCR-06`, `SCR-08`.

- **FE:** [x] CRUD ví/danh mục; [x] số dư ban đầu; [x] danh mục thu/chi; [x] form VND số nguyên.
- **BE:** [x] bảng wallets/categories gắn `ownerUserId`; [x] endpoint list/create/update/delete; [x] chặn xóa đối tượng đang có giao dịch.
- **Test:** [x] tạo/trùng tên theo chính sách được chốt; [x] số dư âm hợp lệ; [x] không thể đọc ví người khác; [x] migration chạy trên D1 test.
- **Done:** [x] mỗi User tạo được ví/danh mục độc lập và truy xuất đúng quyền.

### P03 — Thu chi và undo
**Màn hình:** `SCR-03`, `SCR-04`.

- **FE:** [x] nhập loại giao dịch/số tiền/danh mục/ví/ngày giờ/ghi chú/nhãn; [x] danh sách; [x] sửa; [x] xóa + undo trong 10 giây; [x] hiển thị lỗi rõ ràng.
- **BE:** [x] API CRUD giao dịch, kiểm tra chủ sở hữu FK; [x] schema timestamps, revision; [x] tính số dư từ ledger; [x] delete/undo semantics tương thích sync.
- **Test:** [x] tiền VND nguyên; [x] không nhập số không hợp lệ; [x] sửa giao dịch cập nhật tổng; [x] hoàn tác 9 giây hợp lệ / sau 10 giây hết hiệu lực; [x] không tạo bản ghi trùng khi retry.
- **Ghi chú:** FE đã kết nối API BE cho danh mục, ví và CRUD giao dịch; dữ liệu server là nguồn cho số dư ledger.
- **Done:** [x] có thể ghi thu chi và kiểm tra số dư chính xác bằng API thật.

### P04 — Chuyển khoản và Dashboard cơ bản
**Màn hình:** `SCR-07`, `SCR-02` (lõi).

- **FE:** [x] form ví nguồn/đích và số tiền; [x] dashboard số dư tổng, thu/chi tháng, giao dịch gần nhất.
- **BE:** [x] chuyển tiền atomic 2 ví trong cùng một giao dịch dữ liệu; [x] summary endpoint; [x] ghi lịch sử loại transfer.
- **Test:** [x] transfer không tăng tổng thu/chi; [x] rollback khi một bước lỗi; [x] không trùng transfer khi retry; [x] cùng ví nguồn/đích bị từ chối.
- **Done:** [x] dashboard và ledger khớp trên nhiều ví.

### P05 — Offline-first, đồng bộ hai chiều
**Màn hình:** `SCR-16` (trạng thái sync), nền cho `SCR-20`.

- **FE:** [x] IndexedDB riêng theo account (dùng IndexedDB native); [x] cập nhật local + outbox cùng transaction; [x] tự thử khi mở app/có mạng; [x] trạng thái pending/syncing/synced/error; [x] logout giữ outbox chưa đồng bộ.
- **BE:** [x] sync push/pull theo `ownerUserId`, cursor/revision, idempotency key; [x] audit thay đổi do Admin push; [x] phân quyền API; [x] push batch nguyên tử.
- **Test:** [x] retry sau mất phản hồi không tạo bản ghi trùng; [x] Admin sửa online, User pull thay đổi; [x] phát hiện revision conflict và giữ bản local, không overwrite; [x] mạng ngắt khi push; [x] giữ thứ tự thay đổi.
- **Done:** [x] luồng offline và đồng bộ lại an toàn trong các trường hợp được hỗ trợ.
- **Ghi chú:** FE hiện dùng IndexedDB native thay Dexie. Chính sách xử lý conflict là phát hiện, giữ thay đổi cục bộ và báo lỗi; chưa có giao diện hợp nhất hai phiên bản.

### P06 — Quản trị tài khoản và tài chính mọi User
**Màn hình:** `SCR-18`, `SCR-19`, `SCR-20`, `SCR-21`.

- **FE:** [x] danh sách User; [x] form tạo/sửa tài khoản; [x] khóa/kích hoạt tài khoản; [x] chọn tài khoản đích; [x] xem/thêm/sửa/xóa giao dịch, ví và ngân sách theo tháng/tổng/danh mục; [x] bảng audit.
- **BE:** [x] admin-only account CRUD (xóa mềm để giữ dữ liệu); [x] finance API gắn `ownerUserId`; [x] kiểm tra role phía server; [x] audit append-only với actor, target, action và time.
- **Test:** [x] User gọi admin API bị 403; [x] Admin thao tác User A không tác động User B; [x] thay đổi ví/ngân sách xuất hiện trong luồng pull sync của User; [x] audit phản ánh đúng actor và target.
- **Done:** [x] Super Admin xem/sửa dữ liệu đã đồng bộ của mọi User, User chỉ đọc dữ liệu của mình; thao tác Admin được đưa vào sync stream có cursor.
- **Migration:** `0007_admin_audit_immutability.sql`, `0008_p06_budgets.sql`; schema hiện tại là 9 sau migration P07 `0009_p07_budget_threshold_events.sql`.
- **Chặn:** quy trình reset/xóa/khóa tài khoản cần đặc tả riêng trước khi bật thao tác hủy dữ liệu.

### P07 — Ngân sách
**Màn hình:** `SCR-09`, `SCR-02` (bổ sung).

- **FE:** [x] tổng ngân sách tháng, ngân sách theo danh mục, tiến độ và tiền còn lại; [x] nhấn xem giao dịch liên quan.
- **BE:** [x] budget CRUD và aggregation; [x] event ngưỡng 80%, 100%; [x] khóa dedupe theo user/budget/kỳ/mốc.
- **Test:** [x] 79→80→100%, mỗi mốc tối đa 1 lần/kỳ; [x] khoản chuyển ví không tính là chi tiêu; [x] khi sửa/xóa giao dịch kiểm tra lại mức sử dụng.
- **Done:** [x] dashboard và trang ngân sách khớp nhau; migration 0009 tạo event 80%/100% một lần cho mỗi user/ngân sách/kỳ/mốc; API summary tính lại mức dùng sau CRUD giao dịch; xác minh bằng `npm run test:budgets --workspace @thu-chi/backend`, `npm run typecheck` và `npm run lint -- --no-warn-ignored`.

### P08 — Notifications + Passkeys
**Màn hình:** `SCR-15`, `SCR-17` (phần bảo mật).

- **FE:** [x] xin quyền push qua hành động người dùng; [x] đăng ký/hủy đăng ký subscription; [x] UI đăng ký/đăng nhập bằng passkey; [x] hộp thư thông báo.
- **BE:** [x] VAPID + mã hóa subscription bằng AES-GCM; [x] Workers Cron kiểm tra mỗi 15 phút và gửi lúc 21:00 theo timezone; [x] push nhắc **mở app xem tổng kết**; [x] giới hạn thiết bị, thử lại tối đa 3 lần, dedupe và vô hiệu hóa endpoint hết hạn; [x] endpoints WebAuthn challenge/verify có thời hạn, dùng một lần, ràng buộc origin/RP ID và yêu cầu user verification.
- **Test:** [ ] iPhone iOS 26+, PWA đã Add to Home Screen, quyền push bật; [x] scheduler gửi một lần mỗi user/ngày và không gửi lại khi chạy lặp; [x] kiểm tra cô lập User A/User B; [x] lỗi mạng 503 được thử lại tối đa 3 lần và endpoint 410 bị vô hiệu hóa; [x] challenge WebAuthn hết hạn/không dùng lại; [ ] thu hồi quyền push trên iPhone; [ ] passkey đăng ký/xác minh end-to-end (Playwright có sẵn nhưng Worker test server bị sandbox chặn trước khi chạy).
- **Done:** [ ] chờ nghiệm thu thực tế trên iPhone; không cam kết đẩy thông báo tới chính xác từng giây. Lint, typecheck và test tự động cần đạt trước khi nghiệm thu.
- **Quyết định:** khôi phục passkey bằng đăng nhập username/mật khẩu hiện có rồi thêm hoặc xóa passkey trong trang tài khoản; nhắc hằng ngày lúc 21:00 theo múi giờ thiết bị, nội dung chỉ yêu cầu mở app và không chứa số dư/giao dịch; P08 dùng WebAuthn tiêu chuẩn (có thể dùng iCloud Keychain), không tích hợp Apple ID Sign in.

### P09 — Báo cáo và tìm kiếm
**Màn hình:** `SCR-13`, `SCR-10`, `SCR-02` (hoàn thiện).

- **FE:** [x] bộ lọc ngày, danh mục, ví, số tiền, nhãn, từ khóa; [x] biểu đồ cơ cấu dạng tròn và xu hướng dạng cột/đường; [x] số liệu tổng hợp theo ngày/tuần/tháng; [x] Dashboard có chi tiêu nhanh và lối vào báo cáo/tìm kiếm.
- **BE:** [x] endpoint tìm kiếm và báo cáo khóa theo `ownerUserId`; [x] ranh giới ngày/tháng theo timezone IANA; [x] trang/kích thước trang, sắp xếp và migration index cho ngày, danh mục, ví, số tiền; [x] summary Dashboard dùng cùng ranh giới tháng địa phương.
- **Test:** [x] dữ liệu trước/sau kỳ không lọt vào báo cáo và biên ngày địa phương được tính đúng; [x] tổng chuỗi ngày khớp tổng ledger; [x] Admin chỉ tổng hợp tài khoản được chọn; [x] lọc tiền/nhãn/từ khóa và pagination.
- **Done:** [x] báo cáo khớp Dashboard theo cùng timezone, truy vấn giới hạn đúng chủ sở hữu. Xác minh bằng `npm run lint`, `npm run typecheck`, `npm test` và build frontend.

### P10 — Tiết kiệm và định kỳ
**Màn hình:** `SCR-11`, `SCR-12`, mở rộng `SCR-15`.

- **FE:** [x] nhiều mục tiêu, số đích/hạn; [x] ghi đóng góp thủ công; [x] định kỳ ngày/tuần/tháng; [x] màn xác nhận đã thanh toán.
- **BE:** [x] goals/contributions, recurring schedules, paid-confirmation APIs; [x] sự kiện nhắc trước hạn 1 ngày/vào ngày hạn; [x] mốc tiết kiệm 25/50/75/100%, gần hạn và tuần.
- **Test:** [x] recurring không tự trừ khi chưa xác nhận; [x] duplicate confirmation không tạo 2 giao dịch; [x] tính đúng tiến độ; [x] lọc timezone.
- **Done:** [x] các luồng sử dụng được từ đầu đến cuối, dữ liệu đồng bộ và phân quyền chính xác. Typecheck, lint, test suite và build frontend đều đạt.
- **OQ-03:** dùng mặc định có thể đổi: gần hạn là trước 7 ngày; tổng kết tuần Chủ nhật lúc 21:00 theo timezone của tài khoản (Asia/Bangkok nếu chưa có cài đặt).

### P11 — Tích hợp Google Drive Backup, OCR, xuất PDF và UAT
Chia thành 3 release độc lập:

**P11A — Backup & Restore (phải có trong bản cốt lõi)** — `SCR-16`
- **FE:** [ ] trạng thái/lịch sử backup; [ ] flow xác nhận restore; [ ] cảnh báo thiếu khóa; [ ] UX nhập recovery key.
- **BE:** [ ] backend nắm quyền Google Drive của Super Admin bằng OAuth phù hợp; [ ] archive mã hóa version theo user; [ ] không xuất token/secret Drive cho User; [ ] quản lý metadata backup và kiểm soát role.
- **Test:** [ ] backup User A không lẫn B; [ ] backup mã hóa không đọc được nếu thiếu khóa; [ ] khôi phục trên thiết bị khác; [ ] sai khóa, archive hỏng, lỗi quota Drive; [ ] xung đột dữ liệu khôi phục.
- **Chặn:** OQ-05, chính sách giữ bản sao, quyền khôi phục, thiết kế bảo vệ/chia sẻ recovery key; **không phát hành backup “có vẻ chạy” khi chưa qua restore drill**.

**P11B — OCR** — `SCR-05`
- **FE:** [ ] camera/file, Tesseract.js, sửa gợi ý, xác nhận để chuyển sang form thu chi.
- **BE:** [ ] dùng API giao dịch hiện có; không bắt buộc server OCR.
- **Test:** [ ] hóa đơn mờ/không có tiền/ngày sai, xử lý lỗi rõ ràng; [ ] không tự ghi chi tiêu khi chưa xác nhận.
- **Chặn:** OQ-04.

**P11C — Xuất PDF** — `SCR-14`
- **FE:** [ ] chọn khoảng thời gian, tạo PDF (pdf-lib), tải/chia sẻ file.
- **BE:** [ ] endpoint dữ liệu báo cáo, kiểm tra role và owner.
- **Test:** [ ] tổng tiền và biểu đồ đúng; [ ] Unicode tiếng Việt; [ ] múi giờ; [ ] User không xuất được dữ liệu tài khoản khác.

**UAT/Release:** [ ] E2E trên iPhone sau cài PWA; [ ] đo hiệu năng; [ ] regression tất cả role; [ ] kiểm tra quota free tier; [ ] test backup/restore, mất mạng, đổi tài khoản, khôi phục sau xóa dữ liệu Safari; [ ] checklist production secrets/config.

## 4. Ma trận đầy đủ 21 màn hình → phase

| SCR | Màn hình | Phase chính | Phụ thuộc/hoàn thiện |
|---|---|---|---|
| 01 | Đăng nhập | P01 | Passkey P08; Apple ID phụ thuộc điều kiện |
| 02 | Dashboard | P04 | Ngân sách P07; báo cáo P09; tiết kiệm P10 |
| 03 | Danh sách giao dịch | P03 | Sync P05, filter P09 |
| 04 | Thêm/Sửa giao dịch | P03 | Sync P05, OCR P11B |
| 05 | Quét hóa đơn | P11B | P03 |
| 06 | Quản lý ví | P02 | Sync P05 |
| 07 | Chuyển tiền | P04 | P02, P03, P05 |
| 08 | Danh mục | P02 | Sync P05 |
| 09 | Ngân sách | P07 | P03–P05 |
| 10 | Báo cáo | P09 | P03–P07 |
| 11 | Tiết kiệm | P10 | P05, P08 |
| 12 | Giao dịch định kỳ | P10 | P03, P08 |
| 13 | Tìm kiếm nâng cao | P09 | P03 |
| 14 | PDF | P11C | P09 |
| 15 | Thông báo | P08 | P07, P10 |
| 16 | Sao lưu và đồng bộ | P05 + P11A | P01, P03, P06 |
| 17 | Cài đặt/bảo mật | P01 + P08 | P01 |
| 18 | Quản lý User | P06 | P01 |
| 19 | Tạo/Sửa User | P06 | P01 |
| 20 | Quản lý tài chính theo User | P06 | P05 |
| 21 | Nhật ký quản trị | P06 | P01 |

## 5. Quy trình chuẩn trong **mỗi phase** (vertical slice)

1. **Chuẩn bị:** xác nhận scope/acceptance; nếu có câu hỏi mở là blocker thì chốt trước.
2. **Database:** migration + seed dữ liệu test; không dùng database production để thử.
3. **Backend:** viết API contract (request/response/errors, RBAC), API handler, unit/integration tests; thử 401/403 và dữ liệu chéo.
4. **Frontend:** xây UI, validate, loading/empty/error, gắn API thật; nếu offline cần ghi IndexedDB/outbox.
5. **End-to-end:** luồng User và Super Admin, online/offline, các giá trị biên, security negative tests.
6. **Code review/CI:** chạy lint/typecheck/unit/integration/E2E; cập nhật docs và checklist; deploy preview/test.
7. **Nghiệm thu:** demo tính năng hoạt động trên iPhone, cập nhật trạng thái `Todo → In Progress → Code Complete → Tested → Done` và ghi các lỗi chưa khắc phục.

**Định nghĩa Done:** API thật hoạt động; frontend và backend đúng quyền; migration chạy; unit + integration + E2E xanh; trạng thái loading/empty/error xử lý; không lộ secret; kiểm thử iPhone với chức năng cần native PWA; tài liệu và acceptance cập nhật. Không đánh dấu Done khi chỉ có UI mock.

### Mẫu task/PR

```md
- [ ] [P03][BE] POST /transactions + validation + RBAC + unit test
- [ ] [P03][DB] Migration transactions, indexes, revision
- [ ] [P03][FE] SCR-04 tạo giao dịch + error/empty/loading
- [ ] [P03][TEST] API integration + E2E tạo giao dịch
- [ ] [P03][UAT] Ghi 50.000 VND, số dư giảm đúng, User khác không đọc được
```

## 6. Quyết định còn mở và phase bị ảnh hưởng

| Nội dung | Cần quyết định trước | Phase |
|---|---|---|
| Bootstrap Super Admin; reset/quên mật khẩu | Chốt quy trình tạo đầu tiên, recovery, khóa/hủy tài khoản | P01, P06 |
| Conflict Admin–User sửa cùng một giao dịch | Phát hiện đã thiết kế; cần chính sách xử lý, tránh ghi đè ngầm | P05, P06 |
| Lịch backup, retention, chia sẻ recovery key | Không tự đặt lịch/số lượng; kiểm chứng restore thực tế | P11A |
| OQ-01 — đo tốc độ nhập liệu | Tiêu chí số thao tác/thời gian | P03/UAT |
| OQ-02 — import MISA | Có/không và định dạng dữ liệu | Ngoài scope hiện hành cho tới khi chốt |
| OQ-03 — gần hạn tiết kiệm và tổng kết tuần | Ngày/giờ cụ thể | P10 |
| OQ-04 — OCR lỗi | Hành vi fallback | P11B |
| Sign in with Apple web | Điều kiện Apple Developer và chi phí; không chặn login username/password | Tích hợp tùy chọn |
| Passkey recovery và iOS Web Push | Kiểm chứng trên iPhone thật và thiết kế recovery | P08 |
| Sức chứa và chính sách bảo mật data/server | Kiểm tra Cloudflare/Drive free limits, backup/restore, audit | P00, P11A |

## 7. Thứ tự release thực dụng (để dùng thử sớm)

- **R0 — Nền móng (P00–P01):** khởi chạy PWA, đăng nhập, phân quyền đúng.
- **R1 — Ghi thu chi (P02–P04):** ví, danh mục, thu chi, chuyển ví, dashboard cơ bản; test online.
- **R2 — Dùng thực tế nhiều người (P05–P06):** offline sync hai chiều, Super Admin quản lý User; release sau khi xung đột được giải quyết an toàn.
- **R3 — Giám sát tài chính (P07–P08):** ngân sách, push 21:00, passkey; kiểm thử iPhone.
- **R4 — An toàn dữ liệu (P11A):** backup/restore mã hóa Drive; **bắt buộc trước khi dựa vào ứng dụng để lưu dữ liệu quan trọng lâu dài**.
- **R5 — Tăng giá trị (P09–P10):** báo cáo, tìm kiếm, tiết kiệm, định kỳ.
- **R6 — Tiện ích thêm (P11B–P11C):** OCR, PDF, regression và tối ưu.

> **Khuyến nghị an toàn:** Có thể chuyển P11A ngay sau P06, trước P07–P08, nếu muốn bảo vệ dữ liệu đa người dùng sớm. Các phase nêu thứ tự phụ thuộc, không đưa ước lượng ngày vì chưa có capacity/sprint xác nhận.

## 8. Test cases cốt lõi xuyên suốt

| ID | Tình huống | Kết quả bắt buộc |
|---|---|---|
| T01 | User A đọc/sửa `ownerUserId=B` | 403, không rò dữ liệu |
| T02 | Admin chỉnh giao dịch User B | Audit; User B nhận bản cập nhật khi đồng bộ |
| T03 | User tạo giao dịch offline, online trở lại | Chỉ 1 bản ghi lên D1, trạng thái chuyển Synced |
| T04 | User offline sửa cùng bản ghi Admin đã sửa online | Phát hiện xung đột, không âm thầm ghi đè |
| T05 | Chuyển tiền giữa hai ví | Tổng thu/chi không đổi, số dư 2 ví nhất quán |
| T06 | Cảnh báo ngân sách 80% và 100% | Mỗi mốc một lần/kỳ |
| T07 | Nhắc lúc 21:00 khi PWA đóng | Push nhắc mở app, kiểm thử iPhone; chấp nhận giới hạn delivery |
| T08 | Xóa giao dịch và undo trong 10 giây | Undo đúng trong cửa sổ, hết hạn thì xử lý nhất quán |
| T09 | Backup rồi restore User A | Khôi phục đúng dữ liệu A, không lẫn B; cần recovery key |
| T10 | Xóa cache/dữ liệu web trên iPhone | Có quy trình restore từ bản backup đã có |
| T11 | User không có quyền tạo tài khoản | UI không mở chức năng; API cũng trả 403 |
| T12 | Kỳ định kỳ chưa xác nhận thanh toán | Không tự tạo giao dịch thu/chi |
| T13 | Quét OCR trả sai số tiền | Chỉ gợi ý để chỉnh, không tự lưu |
| T14 | Xuất PDF | Đúng khoảng thời gian, tiếng Việt và số liệu theo owner |

---

**Ghi chú:** Đây là **execution roadmap** dựa trên screen inventory và đặc tả hiện tại, các API/path và schema trong checklist là đề xuất để phát triển, chưa phải API specification được duyệt. Khi chốt các câu hỏi mở, cập nhật tài liệu này trước khi chuyển phase phụ thuộc sang Done.
