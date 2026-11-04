# Local dev, hiệu năng và làm mới dữ liệu

Ngày đo: **04/11/2026, Asia/Bangkok**. Máy Windows x64, PowerShell 5.1, Node **24.21.0**, npm **11.19.0**, Vite **7.3.7**, Docker Desktop Linux containers. Không deploy cloud; giữ các thay đổi Git đã có.

## Công nghệ và cách chạy đã xác minh

Monorepo npm workspaces: React 19/Vite/TypeScript, Hono/Cloudflare Workers/Wrangler, D1 SQLite local. Không đổi framework/database. D1 native Windows và volume Docker là hai nguồn dữ liệu khác nhau.

`npm.cmd run dev:local` chạy Vite native 5173 và giữ backend Wrangler dev Docker 8787 với **volume D1 hiện có**. `compose.local.yaml` mount backend source để tự reload; không migrate/seed/reset khi khởi động. Mode Vite `localdev` ép API local, proxy `/api` và `/auth` cùng origin. Các biến production không được dùng để chọn backend local. Không sửa binding D1 production.

Lệnh riêng: `dev:api`, `dev:web`; quản lý: `dev:status`, `dev:logs`, `dev:stop`. Tiến trình Windows chạy ẩn; PID/thời điểm tạo và stdout/stderr riêng ở `.preview/local/`. Cổng có tiến trình không thuộc launcher sẽ bị từ chối; khóa file chống hai lệnh start/stop cùng lúc. Chỉ dừng tiến trình/service do launcher quản lý, giữ dữ liệu.

Native backend là lựa chọn **rõ ràng** `npm.cmd run dev:api -- -ApiMode Native`, dùng `.wrangler/state` riêng; không tự chuyển dữ liệu/tài khoản từ Docker. Nếu schema chưa sẵn sàng thì báo lỗi; migration/bootstrap là bước chuẩn bị riêng trong README. Native backend không được dùng để thay thế âm thầm khi Docker lỗi.

## Các số đo và nguyên nhân

| Phần | Kết quả / cách hiểu |
|---|---|
| Build frontend Windows trước sửa | **13.672 ms** tổng tsc + Vite + Workbox; Vite **4,31 giây**. Log `.preview/performance/build-before.log` |
| Docker trước sửa | Các lượt build UI trong phiên: riêng `chown -R`/`chmod -R /app` **51,8–60,4 giây**, trong khi biên dịch frontend khoảng 13–19 giây. Đổi quyền cả node_modules tạo lớp image lớn và chi phí export; không phải thời gian React render |
| Docker sau sửa quyền | `COPY --chown --chmod` đặt quyền source khi copy; chỉ tạo/chown ba thư mục cần ghi. Bước chuẩn bị quyền còn **0,3 giây**, không duyệt lại node_modules |
| Build Docker dev lần đầu sau đổi package.json | **159.437 ms**: cache npm ci bị vô hiệu bởi manifest đổi, phải cài dependencies và export/unpack image. Đây không phải số đo build tăng dần; không coi toàn bộ lần build này nhanh hơn trước |
| Build Docker dev tăng dần | **7.846 ms** khi chỉ đổi source/tài liệu, npm ci dùng cache; chuẩn bị quyền **0,3 giây**, export/unpack **2,8 giây**. Target dev không biên dịch production; phát triển qua mount/HMR còn không cần lệnh build này |
| Vite native | Probe đầu tiên sẵn sàng qua HTTP sau **1.512 ms**; Vite báo nội bộ **750 ms**. Bộ launcher thực tế báo Vite chờ khoảng 1,1–1,6 giây |
| Start bộ local giữ Docker DB | Lần chuyển cấu hình: **11.676 ms**; dừng rồi chạy lại: **9.572 ms**. Bao gồm Compose, Wrangler, Vite và xác minh proxy/database |
| Gọi lại khi đang chạy | Sau thay `Get-NetTCPConnection` bằng bảng TCP .NET và tái sử dụng mode/PID: **1.730 ms**; trước tối ưu launcher **4.866 ms**. Không tạo server trùng |
| Frontend HMR thực tế | **217 ms**, không điều hướng lại tài liệu, bản nháp trường đăng nhập giữ nguyên |
| Backend reload thực tế | **1.199 ms** từ sửa health handler đến thấy header probe qua frontend proxy; source được khôi phục nguyên byte sau kiểm tra |
| Docker frontend dev tùy chọn | Image dev đã khởi động và proxy tới backend ở container tạm 5181, sẵn sàng sau **5.420 ms**; container thử được dừng/xóa |

HMR là cách làm việc hằng ngày. Production build chỉ chạy khi cần xác minh bundle/PWA hoặc chuẩn bị triển khai. Không phải chờ Docker build mỗi lần sửa CSS/React/backend source. Thay dependencies/runtime vẫn cần cài/build lại đúng môi trường.

## API, database và render được đo riêng

Baseline với Workers/D1 thật trên **database test biệt lập**, 5 lần đọc mỗi API: health **15,4 ms**, summary **28,6 ms**, wallets **15,5 ms**, categories **20,6 ms**, transactions **19,4 ms**, budgets **16,1 ms**, savings **15,4 ms**, recurring **19,1 ms** trung bình. Bao gồm HTTP/proxy/auth/D1/JSON, không phải chỉ thời gian truy vấn.

Probe local đang dùng: health backend trực tiếp **19–32 ms**, qua Vite **19–26 ms**; xác nhận `environment=dev`, database OK. Đăng nhập/đọc ví hiện có và mở dashboard qua proxy đạt. Báo cáo `.preview/performance/dev-verification.json` chỉ lưu số đếm/timing, không lưu mật khẩu/cookie/token.

`scripts/measure-db.mjs` chạy SQL repository thật trên SQLite bộ nhớ với **1.000 giao dịch giả**, 20 lần/phép đọc:

| Đọc | SQL trung bình | Toàn repository trung bình |
|---|---:|---:|
| Summary | 1,08 ms / 2 truy vấn | 2,87 ms |
| Wallets | 0,24 ms / 1 truy vấn | 0,38 ms |
| Transactions | 3,18 ms / 1 truy vấn | 3,38 ms |
| Report | 2,33 ms / 4 truy vấn | 6,09 ms |
| Search | 0,49 ms / 2 truy vấn | 1,13 ms |

Đây là CPU SQLite trong fixture, **không phải** thời gian D1 production hoặc RPC Workers. Không lấy số này trừ khỏi HTTP để suy ra chính xác thời gian mạng. Với dữ liệu đã đo, chưa có bằng chứng cần sửa SQL/tính tiền/index.

Playwright đo Navigation/Resource Timing, paint và Chromium CDP CPU riêng. Baseline dashboard thấy nội dung sau khoảng **788 ms**; lượt sau có lịch tháng khoảng **549 ms Chromium / 561 ms WebKit**. Chromium ghi khoảng **185 ms JavaScript**, **158 ms layout**, **14 ms recalc style** toàn trang trong cửa sổ đo; không phải profiler riêng React commit. Số đã bao gồm kiểm tra hiển thị của Playwright. Khác UI/cache và mẫu đơn không đủ chứng minh mức tăng tốc cố định; dữ liệu thô lưu `.preview/performance/before.json` và `final-chromium.json`/`final-webkit.json`.

Đã giảm đọc hóa đơn/tiết kiệm từ hai lần xuống một lần lúc mở dashboard. Sync chỉ phát sự kiện khi có thay đổi và nêu loại dữ liệu thay đổi; loader không đọc lại hóa đơn do thay đổi ví/danh mục. Dashboard đã bỏ API danh mục không còn dùng sau khi thay hai khối cũ bằng lịch. Nếu sync nhận lịch sử giao dịch/ví mới, dashboard có thể đọc tiếp sau lần đầu để phản ánh thay đổi; GET trùng đang chạy chia sẻ transport, không cache kết quả đã hoàn tất.

## Vuốt làm mới

- Thả tay tự gọi loader của màn hình đang mở, không `location.reload()` và không cần nút Cập nhật PWA.
- Giữ component, nội dung, vị trí cuộn, bộ lọc đã áp dụng và bản nháp chưa gửi. Spinner nổi không đẩy nội dung xuống. Offline/API lỗi báo rõ và giữ dữ liệu đang có.
- Chia sẻ lần refresh đang chạy, hủy GET khi đổi scope/bộ lọc/unmount và kiểm tra signal trước khi ghi state. Hủy một bên đọc GET không ảnh hưởng bên còn dùng cùng transport.
- Cache danh sách đầy đủ trong một transaction IndexedDB, giữ bản sửa/xóa chưa đồng bộ, loại bản cache cũ không còn trên server. Không đưa kết quả phân trang vào helper này.
- Không thêm polling màn hình. Retry outbox 30 giây hiện có chỉ lên lịch khi có mạng và trang hiển thị; sự kiện sync thay cho timer 5 giây ở màn hình đồng bộ.

## Kiểm chứng và dữ liệu

- Lint và typecheck Windows toàn dự án đạt. Unit/config/API: **86 Vitest + 57 backend/config** đạt trước thêm lịch; **3 unit test lịch** đạt sau khi thêm lịch, kiểm tra gộp ngày local, loại xóa/tháng khác, năm nhuận và bố cục tuần.
- Build frontend/PWA Windows đạt; vẫn còn cảnh báo bundle chính khoảng 534 kB và import sync-storage tĩnh/động. Không lấy các cảnh báo đó làm bằng chứng lỗi đường dẫn contracts.
- Chromium/WebKit: luồng kéo/thả thật bằng Chromium CDP và DOM WebKit, giữ bản nháp/vị trí cuộn/nội dung, một request khi kéo lặp, offline/API 503, hủy request khi đổi bộ lọc, giữ outbox chỉnh sửa/xóa và làm mới 13 màn hình cá nhân đã đạt. Ví/danh mục CRUD và thẻ hóa đơn/tiết kiệm cũng đã đạt trong lượt liên quan.
- Hai lượt E2E phát hiện sai bộ chọn trường Loại và kỳ vọng DELETE giao dịch trong mã kiểm tra (API trả 200 kèm giao dịch đã xóa mềm). Đã sửa kỳ vọng theo API; không sửa nghiệp vụ để làm khớp test. Báo cáo từng lượt giữ tại `.preview/performance/`, không coi lượt có lỗi là đạt toàn bộ.
- Lịch tháng: **2/2 E2E đạt** trên Chromium/WebKit sau sửa kỳ vọng HTTP, có kiểm tra tổng thu/chi theo ngày Bangkok, xóa mềm, ngoài tháng, ẩn tiền, link lọc ngày và ảnh màn hình 320 px. Lượt nhóm trước có 18 ca đạt; hai ca lịch được chạy lại riêng thay vì lặp 18 ca đã đạt. HTML của lượt nhóm lưu `.preview/performance/final-run-report/`, JSON `final-run.json`; trạng thái lượt lịch và ảnh tại `.preview/performance/calendar-final/`.
- Kiểm tra phản hồi cũ được tăng cường bằng hai payload tổng thu khác nhau (điều khiển phản hồi từ API thật trong bài kiểm tra): **2/2 Chromium/WebKit đạt**, dữ liệu mới không bị payload chậm ghi đè. Báo cáo mới nhất `playwright-report/`, `test-results/e2e-results.json`, artifact `.preview/performance/race-final/`. Đây là tình huống cố ý điều khiển phản hồi, không phải kiểm chứng tính đúng của tổng thu từ dữ liệu fixture đó.
- ESLint loại toàn bộ thư mục artifact `.preview/**` (đã gitignore), gồm JavaScript minify của báo cáo trace. Không loại source hoặc các test ở `e2e/`/`apps/`.
- Docker DB trước/sau đổi cấu hình và dừng/mở lại: **1 user, 1 ví, 1 giao dịch, 0 chuyển ví**, schema/health bình thường. Không reset, seed lại hoặc chuyển database đang dùng. Các giao dịch giả trong E2E ở `.wrangler/test`, không ở volume dev.
- Probe HMR tạm sửa rồi khôi phục nguyên byte `LoginPage.tsx` và health handler; không để lại endpoint/header probe trong ứng dụng.

Chưa kiểm chứng thao tác vật lý trên iPhone/Safari PWA, hiệu năng thiết bị yếu hoặc D1 cloud/production. Vite dev không chạy service worker. Native backend launcher đã kiểm tra cú pháp/cấu hình; phiên này giữ và xác minh runtime Docker để tránh dùng nhầm database native.

### Giao diện cũ còn lưu trong PWA khi chuyển sang dev

Đã xác minh qua TryCloudflare rằng server trả module có `MonthCalendar`, không có hai mục cũ, nhưng trước sửa `/sw.js` trả HTML. Worker PWA đã cài không thể cập nhật bằng phản hồi đó và có thể tiếp tục phục vụ app shell cũ. Dev không đăng ký worker mới; worker từ lần preview trước vẫn cần được thu hồi.

Đã thêm plugin chỉ chạy ở Vite dev: `/sw.js` trả worker tự unregister, không ép reload các tab đang mở; `/auth/dev-refresh` là trang khôi phục nằm ngoài navigation fallback của worker cũ, bỏ đăng ký worker root cùng origin rồi chuyển về dashboard. Không xóa dữ liệu/cookie/cache, không đổi origin và không sửa Worker production.

Kiểm tra Chromium trực tiếp qua URL TryCloudflare ngày 04/11/2026: đăng nhập đọc dashboard thực, cài worker giả lập luôn trả giao diện cũ, xác nhận thấy giao diện cũ, mở đường khôi phục và xác nhận **lịch hiển thị, đăng nhập/localStorage/database IndexedDB còn nguyên, worker không còn đăng ký**. Worker thử được tạo tạm và xóa sau kiểm tra. Kết quả và ảnh đã ẩn số tiền lưu `.preview/e2e/pwa-dev-recovery/`. Bài kiểm tra lỗi charset ở HTML giả lập lần đầu đã được sửa trước lượt đạt; không phải lỗi lịch. Chưa kiểm chứng thao tác này trên iPhone vật lý.

Lệnh kiểm tra có chủ đích: `node scripts/verify-pwa-dev.mjs`, nhận origin và credentials local qua biến môi trường trong bộ nhớ; không lưu credentials vào log/tài liệu.

### Lịch chuyển sang tab riêng

Theo phản hồi về lịch dài trên Trang chủ, lịch hiện ở **`/calendar`**, truy cập bằng tab **Lịch** ở thanh dưới. Trang chủ bỏ khối lịch; 5 mục điều hướng cũ vẫn còn, thành 6 mục với nút bấm/nhãn co giãn. Lịch dùng gần hết chiều ngang và ô ngày có chiều cao theo viewport, giảm lặp số 0. Màn hình có nút ẩn số tiền riêng, đọc API giao dịch và cache/outbox theo tài khoản; không đổi cách tính tiền.

04/11/2026: lint/typecheck toàn dự án và build frontend/PWA đạt. **4/4 E2E Chromium/WebKit đạt**: tab Lịch không còn ở Trang chủ, số liệu thật theo ngày, ẩn tiền và link lọc ngày; bảng không bị thanh dưới che ở **320×667 và 320×740**; vuốt làm mới không điều hướng lại trên **14 màn hình**, gồm Lịch. Artifact/ảnh `.preview/e2e/calendar-tab/`, báo cáo HTML `playwright-report/` và JSON `test-results/e2e-results.json`. Không lặp các test nghiệp vụ SQL không bị thay đổi.

Lượt tiếp theo cùng ngày đổi ô ngày thành nút chọn: không chuyển sang tìm kiếm; bên dưới lịch có tổng thu/chi và các giao dịch đúng ngày, mới nhất trước, mặc định hôm nay. Ngày trống báo rõ; ẩn tiền che cả tổng và từng khoản. Dùng dữ liệu đang có nên đổi ngày không phát GET. Lint/typecheck/build đạt; **2/2 E2E Chromium/WebKit đạt**, gồm chuyển ngày có/không giao dịch, dữ liệu ngoài tháng/đã xóa không xuất hiện, giữ `/calendar`, không gọi API khi chọn ngày và bố cục 320×667/740. Ảnh/bằng chứng mới `.preview/e2e/calendar-day-details/`; HTML/JSON mới nhất trong `playwright-report/` và `test-results/e2e-results.json`. Cách mở tìm kiếm khi chạm ngày trong lượt trước đã được thay bằng chi tiết ngay tại lịch.

### PWA dev cùng scope và lịch chuyển tháng

Khi kiểm tra phản ánh về khung Safari, phát hiện Vite dev thiếu `link[rel=manifest]`, thiếu meta standalone và `/manifest.webmanifest` trả HTML. Các link vẫn là NavLink cùng origin. Đã tách cấu hình manifest chung `pwa-manifest.ts`, phục vụ JSON/link manifest trong dev mà không bật worker cache; index có meta iPhone/mobile app. `scope/start_url/id` giữ `/`, `display` giữ `standalone` trong dev và build. Docker frontend dev mount cả hai helper cấu hình mới.

`scripts/verify-local-navigation.mjs` đã chạy **Chromium và WebKit qua TryCloudflare thực tế**: cả 6 tab cùng scope/origin, không popup, không tải tài liệu mới, không đăng ký worker cache. Lint/typecheck/build đạt. Kết quả `.preview/e2e/pwa-navigation/result.json`. Đây là xác minh metadata và điều hướng web, **không xác minh được UI native Safari trên iPhone thật**. Trình duyệt Safari thông thường có thanh công cụ riêng; chế độ ứng dụng cần mở từ Màn hình chính. Nguồn: [Apple meta tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html), [W3C manifest scope](https://www.w3.org/TR/appmanifest/#scope-member).

Theo yêu cầu tiếp theo, bỏ chú thích ký hiệu/chạm ngày bên dưới lịch; thêm nút tháng trước/sau, chuyển được năm. Dữ liệu tổng và chi tiết lọc theo tháng/ngày đang xem; tháng hiện tại mặc định hôm nay, tháng khác mặc định ngày đầu; không tô hôm nay ở tháng khác, không phát thêm GET khi đổi tháng/ngày. Lint/typecheck/build đạt; **4 unit test lịch + 4 E2E Chromium/WebKit đạt**, gồm tháng trước có dữ liệu thật, tháng tương lai, chuyển 12/2026 sang 1/2027, chi tiết đúng tháng, bỏ chú thích, bố cục điện thoại và manifest/icon/meta standalone bản build. Artifact `.preview/e2e/calendar-month-navigation/`; HTML/JSON mới nhất ở `playwright-report/`, `test-results/e2e-results.json`.

### Xác nhận xóa giao dịch

Màn hình Giao dịch hiện mở popup giữa viewport trước khi xóa khoản thu/chi, hiển thị tiền/ghi chú/ngày, mặc định focus Hủy. Hủy/Đóng/Escape không ghi hàng đợi; xác nhận mới enqueue delete. Khóa xác nhận trùng/đóng khi lưu, giữ popup khi lưu lỗi. Quản trị tài chính đã có native confirm nên giữ nguyên. Vẫn có hoàn tác 10 giây.

Trong E2E phát hiện lỗi có sẵn: delete sync 200, undo sync 409 vì dùng revision trước xóa. Snapshot hoàn tác được sửa sang revision dự kiến sau xóa (+1); khi gửi undo dùng đúng phiên bản đó, kể cả delete và undo cùng xếp hàng offline. Không đổi API/schema hoặc chạy trên database dev.

04/11/2026: lint/typecheck toàn dự án và build frontend/PWA đạt. **2/2 E2E Chromium/WebKit đạt**, dùng tài khoản/ví/giao dịch thử biệt lập: kiểm tra popup căn giữa, focus Hủy, Hủy/Escape giữ record/outbox/số dư; giả lập lỗi ghi IndexedDB giữ popup và không xóa; xác nhận đúp chỉ tạo 1 outbox/1 push; xóa và hoàn tác online khôi phục số dư **975.000 → 1.000.000 → 975.000đ**; xóa/hoàn tác offline rồi nối mạng gửi hết hàng đợi, số dư vẫn đúng, không nhân đôi. Lượt đầu phát hiện 409 được giữ ở `.preview/e2e/transaction-delete-confirm/`, lượt đạt sau sửa ở `.preview/e2e/transaction-delete-final/`; báo cáo HTML/JSON mới nhất `playwright-report/`, `test-results/e2e-results.json`. Không chạy lại các test không chịu ảnh hưởng.

## Tái hiện có chủ đích

```powershell
npm.cmd run dev:local
npm.cmd run dev:status
npm.cmd run dev:logs
npm.cmd run dev:stop

# Đo lại HMR/proxy; tạm sửa hai marker và khôi phục file trong finally.
node scripts/verify-local-dev.mjs

# Fixture SQLite riêng, không đọc/ghi database dev.
node --experimental-strip-types --experimental-sqlite --experimental-loader ./apps/backend/test/resolve-ts-loader.mjs scripts/measure-db.mjs

# Chỉ build khi cần xác minh bản preview/PWA.
npm.cmd run build -w @thu-chi/frontend
npx.cmd playwright test e2e/dashboard.spec.ts e2e/refresh-data.spec.ts e2e/pull-to-refresh.spec.ts e2e/performance.spec.ts --workers 1
```

Playwright tự chuẩn bị **database test riêng** theo cấu hình hiện có. Không dùng các lệnh seed test cho dev. Script đo HMR không tự gửi credentials; kiểm tra đăng nhập local bổ sung chỉ khi người vận hành cung cấp credentials qua biến môi trường trong bộ nhớ, không ghi vào tài liệu/log.
