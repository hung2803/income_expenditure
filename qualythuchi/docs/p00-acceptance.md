# P00 - Foundation

**Trạng thái: Đang triển khai, chưa nghiệm thu hoàn tất.** Tài liệu P00 đã có
được gom vào file này. Khi hoàn thành phase, cập nhật tổng kết kết quả, thay đổi,
kiểm thử và các việc còn lại tại đây.

<a id="frontend"></a>

## Frontend

Phạm vi: checklist FE được người dùng chọn (P00 trong roadmap). Trạng thái triển
khai: Code Complete; chưa nghiệm thu Tested/Done vì môi trường agent không tải
được npm và không điều khiển được Docker Engine. Không bao gồm P01 authentication.

### Thành phần đã triển khai

- React + TypeScript + Vite + Tailwind; alias `@/` khớp Vite và TypeScript.
- shadcn/ui cấu hình thủ công ở `apps/frontend/components.json`; Button, Input,
  Card và `cn()` nằm trong mã nguồn; theme xanh theo màn hình login.
- `/` và `/login`: giao diện mẫu hiện có; `/setup`: kiểm tra kết nối;
  `/offline`: trạng thái mạng; đường dẫn không tồn tại: trang 404.
- Root router error boundary hiển thị lỗi chung, không hiển thị stack/backend
  error nhạy cảm; bố cục có safe area và trạng thái mạng dùng chung.
- Manifest standalone, scope `/`, PNG 192/512, maskable 512, apple-touch-icon 180.
- Service worker precache file app shell và navigation fallback về index.html;
  không runtime-cache API; loại `/api` và `/auth` khỏi navigation fallback.
- Thông báo lưu giao diện offline; bản cập nhật chờ người dùng chọn Cập nhật.
  Không tự reload trang đang nhập liệu. Đây là cache giao diện, chưa phải lưu
  giao dịch offline, mở khóa offline hoặc đồng bộ tài chính.
- `VITE_API_BASE_URL`: trống = same-origin; hoặc origin HTTP/HTTPS đầy đủ, không
  có `/api` suffix, query, username/password. Kiểm tra cấu hình ngay lúc build.
- HTTP client: credentials, no-store, timeout 10 giây; phân biệt HTTP/network/
  timeout và JSON không hợp lệ. Không đưa nội dung phản hồi lỗi thô vào UI.

### Cấu hình môi trường

Chạy Node/Vite trực tiếp: sao chép `apps/frontend/.env.example` thành
`apps/frontend/.env.local`, sửa `VITE_API_BASE_URL`, khởi động lại dev server.
Giá trị VITE là public và được đóng gói lúc build, không phải secret.

Docker: sao chép `.env.example` ở repo root thành `.env`, đặt origin backend
nếu cần; Compose truyền thành frontend build arg. Trống dùng proxy
`API_PROXY_TARGET=http://backend:8787`. Sau mỗi thay đổi build-time env:

```powershell
docker compose up -d --build --force-recreate --wait frontend
```

Sau khi đổi từ bản scaffold cũ, nếu trình duyệt vẫn hiển thị bản trước, đóng các
tab/ứng dụng localhost rồi mở lại hoặc dùng Ctrl+Shift+R trên máy tính. Các bản
cập nhật sau có thông báo Cập nhật trong giao diện; không cần xóa dữ liệu trang.

Nếu origin API khác frontend, cấu hình CORS allowlist và cookie/auth phù hợp ở
backend. Vite preview proxy phục vụ local; không tự tồn tại trên hosting tĩnh.

### Kiểm tra tự động

```powershell
npm.cmd install
npm.cmd run check
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
```

- Unit: API origin, credentials/no-store, HTTP 403, phản hồi HTML, network, timeout.
- E2E trên bản build: login, 404, password toggle, manifest/icon, SW offline reload,
  deep link offline, không cache API, viewport 320px.
- Các lệnh trên phải chạy thành công trước khi đánh dấu Tested. E2E dùng Chromium
  và WebKit với viewport điện thoại, không thay thế Safari/iPhone thật; bài SW
  offline tự động chỉ chạy Chromium. E2E health gọi Workers/D1 local thật.

Đã cấu hình CI và quy trình preview/rollback; cách bật và ghi bằng chứng ở
[Test P00](#ci-preview).

### Nghiệm thu thủ công còn lại

Xem [hướng dẫn thao tác từng bước và kết quả đạt](#manual).

Đã kiểm tra trong phiên triển khai: JSON/Compose hợp lệ, transpile cú pháp
TypeScript, kích thước/chữ ký PNG; chạy kiểm tra trực tiếp trên mã API đã
transpile cho origin, credentials/no-store, 403, HTML/JSON hỏng, network và timeout.
Đây chưa phải lần chạy đầy đủ Vitest/typecheck/Vite build/Playwright.

- [ ] Lint/typecheck/unit/build hoàn chỉnh với dependencies đã cài.
- [ ] Chạy E2E của bản build mới.
- [ ] iPhone Safari và cài Home Screen qua HTTPS tin cậy.
- [ ] Tải app online một lần, tắt mạng, đóng/mở và reload các route.
- [ ] Phát hành bản build mới trong lúc có form đang nhập: thấy thông báo, chưa
      reload cho đến khi bấm Cập nhật; cập nhật thành công khi có mạng.
- [ ] API không có trong Cache Storage; không báo đăng nhập/sync hoạt động offline.
- [ ] Thử cả same-origin proxy và backend origin riêng.

HTTP LAN dùng để xem giao diện. Service worker trên điện thoại cần HTTPS;
localhost trên máy tính được trình duyệt xem là secure context để kiểm thử.

<a id="backend"></a>

## Backend

Phạm vi: checklist BE của P00. Code đã triển khai; chưa đánh dấu Tested/Done trên
Cloudflare vì chưa có database ID thực, deployment hoặc kiểm thử Wrangler đầy đủ.
Không bao gồm đăng nhập, tài khoản hay đồng bộ tài chính.

### Chạy local bằng Docker

```powershell
docker compose up -d --build --force-recreate --wait backend
```

Container tự áp dụng migration của môi trường dev vào D1 local rồi chạy Worker.
Mở http://localhost:8787/api/health. Khi schema sẵn sàng:

```json
{
  "status": "ok",
  "service": "thu-chi-api",
  "environment": "dev",
  "checks": { "database": "ok" }
}
```

Nếu DB/schema chưa sẵn sàng: HTTP 503, `status: degraded`, database: error.
Không có chi tiết driver, khóa hay nội dung binding trong phản hồi lỗi.
Health là readiness check công khai, không đại diện cho đã có authentication.

Để kiểm qua frontend, chạy cả hai service rồi mở `/setup` và bấm Kiểm tra kết nối:

```powershell
docker compose up -d --build --wait
```

### Môi trường và D1

| Môi trường | Worker | D1 | State local |
|---|---|---|---|
| dev | thu-chi-api-dev | thu-chi-dev | .wrangler/state |
| test | thu-chi-api-test | thu-chi-test | .wrangler/test |
| prod | thu-chi-api-prod | thu-chi-prod | Cloudflare, không dùng trong test local |

Các named environment khai báo riêng APP_ENV, CORS_ORIGINS và DB binding trong
`apps/backend/wrangler.jsonc`. Theo cơ chế Wrangler, vars/bindings không tự kế
thừa giữa các named environment. [Cloudflare Environments](https://developers.cloudflare.com/workers/wrangler/environments/)

ID `00000000-...` chỉ là placeholder local. Ba môi trường cloud phải có database
thực khác nhau; script cloud chặn placeholder, trùng database/Worker và CORS không
hợp lệ trước khi chạy lệnh remote. Top-level thu-chi-local giữ tương thích với
scaffold cũ; các npm script hiện tại luôn chọn named environment tường minh.
Dev named environment có namespace local riêng so với database scaffold cũ;
hiện migration chỉ chứa metadata, chưa có dữ liệu thu chi cần chuyển.

Migration đầu `0001_foundation.sql` tạo app_metadata và schema_version=1, chưa tạo
bảng users/tài chính. Không sửa migration đã áp dụng; thêm file đánh số tiếp theo
khi thay schema. Wrangler theo dõi migration đã chạy. [D1 Migrations](https://developers.cloudflare.com/d1/reference/migrations/)

Chạy trực tiếp bằng Node khi dependencies đã cài:

```powershell
npm.cmd run db:migrate:local
npm.cmd run dev:backend
```

Kiểm thử môi trường test local bằng các terminal riêng:

```powershell
npm.cmd run db:migrate:test -w @thu-chi/backend
npm.cmd run dev:test -w @thu-chi/backend
```

API test ở http://localhost:8788/api/health phải trả `environment: test`. Các
script local chỉ nhận dev/test; không cho truyền --remote hoặc đổi --env qua
tham số phụ. Kiểm tra metadata: `npm.cmd run db:check:local -w @thu-chi/backend`
hoặc `npm.cmd run db:check:test -w @thu-chi/backend`.

### CORS

- Allowlist là danh sách origin chính xác, ngăn cách bằng dấu phẩy; không wildcard,
  không path, query hay username/password. Production dùng HTTPS.
- Origin khác allowlist và khác origin API bị trả 403 trước khi gọi endpoint.
  Origin `null` không được cho phép. Origin hợp lệ được phản hồi credentials và
  Access-Control-Allow-Origin chính xác; không phản chiếu mọi Origin.
- Preflight kiểm method/header, trả 204 khi hợp lệ; không query D1. API dùng
  Cache-Control: no-store, nosniff, Vary: Origin, kể cả nhánh lỗi/preflight.
- Không có Origin (curl, server-to-server, một số GET same-origin) vẫn có thể gọi
  health. CORS không thay thế authentication/RBAC; P01 sẽ triển khai phần đó.
- Nếu dùng frontend origin riêng hoặc gọi trực tiếp API từ điện thoại, thêm đúng
  origin frontend vào CORS của môi trường tương ứng. Không dùng `*` để sửa lỗi.

Sau khi backend chạy, có thể kiểm preflight trong PowerShell:

```powershell
curl.exe -i -X OPTIONS http://localhost:8787/api/health -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type,x-csrf-token"
curl.exe -i http://localhost:8787/api/health -H "Origin: https://untrusted.example"
```

Kết quả lần lượt là 204 và 403; lần 403 không có Access-Control-Allow-Origin.

### Quản lý secret

P00 không cần application secret. APP_ENV/CORS_ORIGINS là public configuration;
Cloudflare API token dùng bởi CLI khác với secret binding của ứng dụng.

- Local dùng `.dev.vars.dev` hoặc `.dev.vars.test` từ file mẫu tương ứng. Không
  dùng credential prod trong dev/test. File theo environment thay thế file generic,
  không giả định được merge. [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- File thật bị gitignore và dockerignore. Docker không tự COPY secret từ host.
  Nếu feature sau cần secret local trong Docker, mount file `.dev.vars.dev` vào
  `/app/apps/backend/.dev.vars.dev` dạng read-only; chỉ mount sau khi file đã tồn
  tại, không thêm nó vào image/build args.
- Local runner tắt fallback nạp secret từ `.env`; `.env` ở repo root dành cho
  frontend build args không trở thành nguồn secret backend.
- Cloud dùng secret binding riêng từng env. Sau khi feature contract quy định
  secret nào cần có, gọi `cloud:secret` với env và TÊN; Wrangler hỏi giá trị qua
  stdin. Không đưa giá trị vào CLI arguments, VITE_*, vars, logs hay git.
- Rotate/revoke từng môi trường; không chia sẻ prod credential với test.
  Chưa thiết kế hoặc phát hành khóa backup/khôi phục trong P00.

### Chuẩn bị cloud — chưa triển khai trong phiên này

1. Tạo riêng D1 dev/test/prod trên tài khoản Cloudflare của chủ hệ thống, cập nhật
   ID thực vào named environment tương ứng trong wrangler.jsonc (giữ file dạng
   JSON hợp lệ vì script guard đọc JSON).
2. Đặt CORS theo frontend thật, đặc biệt prod không để trống và dùng HTTPS.
3. Kiểm tra môi trường bằng `cloud:check` trước khi chạy migration/deploy.
4. Cấu hình domain/route hoặc chủ động bật workers_dev của môi trường cần public.
   Mặc định vẫn false, không tự public API khi chạy local.

Ví dụ cho dev, chỉ chạy khi đã chuẩn bị account và ID thực:

```powershell
npm.cmd run cloud:check -w @thu-chi/backend -- dev
npm.cmd run cloud:migrate -w @thu-chi/backend -- dev
npm.cmd run cloud:deploy -w @thu-chi/backend -- dev
```

Các lệnh migrate/deploy thay đổi cloud thật; `build`, `build:test`, `build:prod`
chỉ bundle dry-run. Không tự chạy remote trên production để thử nghiệm.

### Kiểm thử và trạng thái

Đã chạy trong phiên: 6 test Node về môi trường/guard và local flags; migration
đầu trên SQLite, kiểm mã health thực với DB có/không có schema/metadata, dữ liệu
dev/test độc lập; parser CORS; kiểm cú pháp script và Compose.

Đã bổ sung Vitest cho pipeline Hono: health 200/503, public error, CORS origin,
preflight, cấu hình sai, 404 và cache/security headers. Chưa chạy trọn bộ vì
môi trường agent không cài được npm và không truy cập được Docker Engine.

```powershell
npm.cmd install
npm.cmd run check
```

Chưa nghiệm thu: Worker/D1 runtime local bằng Wrangler, remote migration, deploy
preview/rollback, real dev/test/prod resources và secret binding của feature sau.

<a id="manual"></a>

## Kiểm thử thủ công

Ghi kết quả mỗi mục: Đạt / Chưa đạt / Chưa kiểm tra, kèm trình duyệt, thời điểm
và thông báo lỗi nếu có. Chỉ đánh dấu Tested sau khi các mục liên quan đã qua.
Checklist này không nghiệm thu đăng nhập thật hoặc dữ liệu tài chính.

### 1. Khởi động bản build

Tại thư mục repo, chạy PowerShell:

```powershell
docker compose up -d --build --force-recreate --wait frontend
```

Đạt khi container healthy, mở được http://localhost:5173/login và Console không
có lỗi đỏ liên quan mã ứng dụng. Luôn dùng cùng một origin `localhost:5173`
trong cả quá trình; không đổi qua `127.0.0.1` vì đó là origin/cache khác.

### 2. Giao diện, router và màn hình nhỏ

| Thao tác | Kết quả đạt |
|---|---|
| Mở `/` và `/login` | Có màn hình login theo mẫu |
| Nhập mật khẩu, bấm biểu tượng mắt hai lần | Hiện rồi ẩn lại, giá trị không mất |
| Bấm Đăng nhập/Passkey/Apple ID | Báo bản xem trước/chưa kết nối, không giả đăng nhập thành công |
| Mở `/duong-dan-khong-ton-tai` | Có trang Không tìm thấy trang và nút về đăng nhập |
| Mở `/offline` khi còn mạng | Hiện Đã có kết nối mạng |
| F12 → Toggle device toolbar → đặt chiều rộng 320px | Không tràn ngang, các nút vẫn đọc/bấm được |

Để kiểm lỗi render có thể chạy test tự động tương ứng ở mục 7; không chỉnh file
sai cú pháp để tạo lỗi vì lỗi tải module khác với router error boundary.

### 3. Manifest và cache app shell

Trên Chrome/Edge máy tính, F12 → Application:

1. Manifest: tên Thu Chi/Quản lý thu chi, standalone, có icon 192/512/maskable.
2. Service Workers: có `sw.js` đã activated. Không bật Bypass for network hoặc
   Update on reload khi nghiệm thu hành vi người dùng bình thường.
3. Đợi thông báo Đã lưu giao diện để dùng offline, sau đó reload bình thường
   một lần để trang được service worker điều khiển.

### 4. Mất mạng, mở lại và deep link

1. Giữ Docker chạy; tại DevTools → Network chuyển No throttling thành Offline.
2. Reload bình thường `/login` (không dùng Ctrl+Shift+R trong bài kiểm offline).
3. Mở `/offline`, rồi quay lại `/login` trong cùng tab có DevTools đang offline.
4. Chuyển Network về No throttling sau khi kiểm tra.

Đạt khi login vẫn hiển thị sau reload, có banner offline, `/offline` báo Bạn đang
ngoại tuyến; không tuyên bố đăng nhập hoặc đồng bộ hoạt động khi mất mạng.
Network Offline chỉ tác động mục tiêu DevTools hiện tại, không tự áp dụng cho
mọi tab mới. Bài đóng hết ứng dụng rồi mở lại khi mất mạng cần thử riêng trên
thiết bị thật đã cài PWA qua HTTPS.

### 5. Không cache API

Khởi động backend để kiểm tra API thật:

```powershell
docker compose up -d --build --wait backend
```

1. Bật mạng, mở `/setup`, bấm Kiểm tra kết nối → Đã kết nối backend.
2. F12 → Application → Cache Storage, mở cache của app.
3. Đạt khi có file giao diện JS/CSS/HTML/icon và không có response `/api/health`
   hoặc các API dữ liệu. Không nhầm Cache Storage với HTTP cache của trình duyệt.

### 6. Cập nhật không làm mất nội dung đang nhập

1. Giữ tab `/login` mở, nhập tên tài khoản thử, chưa bấm đăng nhập.
2. Tạo bản mới có một thay đổi nội dung nhìn thấy được và build Docker lại như mục 1.
   Build lại mã không thay đổi có thể không tạo bản service worker mới.
3. Trong tab đang nhập: Application → Service Workers → bấm Update để trình
   duyệt kiểm tra bản worker mới. Không bấm skipWaiting và không bật Update on reload.
4. Đạt khi có thông báo Có phiên bản mới; giá trị đang nhập còn nguyên trước khi
   chọn Cập nhật. Chỉ sau khi bấm Cập nhật mới reload sang giao diện mới.
5. Việc chờ cập nhật cần thử cả khi nhiều tab cùng mở; ghi lại mọi lần tự reload
   ngoài thao tác Cập nhật.

### 7. Lint/typecheck/unit/build và E2E

Các mục này là kiểm tra tự động, không xác nhận bằng việc chỉ nhìn UI.

```powershell
npm.cmd install
npm.cmd run check
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
```

Đạt khi tất cả lệnh kết thúc thành công. `check` gồm lint/typecheck/unit/build
cả workspace và mã test; E2E tự build, chạy preview ở cổng 4173 và Workers/D1 local
test ở cổng 8788. Nếu có lỗi, giữ nguyên
output lỗi để xử lý, không đánh dấu Đạt. E2E có bài kiểm router error boundary.

CI, cấu hình preview HTTPS, rollback và nghiệm thu iPhone thật xem
[hướng dẫn Test P00](#ci-preview) và [biên bản kết quả](#acceptance).

### 8. Kiểm API base URL theo env

Trên máy tính, thử hai cấu hình `.env` ở repo root; mỗi lần đổi phải build lại:

| Cấu hình | Kết quả Network khi bấm kiểm tra kết nối tại `/setup` |
|---|---|
| `VITE_API_BASE_URL=` | Gọi `http://localhost:5173/api/health`, frontend proxy tới backend |
| `VITE_API_BASE_URL=http://localhost:8787` | Gọi trực tiếp `http://localhost:8787/api/health`; backend phải cho phép origin frontend |

Cấu hình thứ hai chỉ để thử trên máy tính: localhost trên điện thoại là chính
điện thoại. Sau khi thử, đưa về giá trị trống và build lại để tiếp tục dùng proxy
trên LAN. Không nhập /api vào cuối base URL, không đặt secret trong VITE_*.

### 9. Safari/iPhone và cài app

Hiện link HTTP LAN dùng để kiểm bố cục, nút bấm và việc mở trang. Phần nghiệm thu
PWA offline trên iPhone để Chưa kiểm tra cho đến khi có HTTPS tin cậy:

1. Mở link HTTPS trong Safari, Chia sẻ → Thêm vào Màn hình chính.
2. Kiểm tên/icon, mở lại từ biểu tượng và xem có giao diện standalone.
3. Tải online một lần để hoàn tất cache, bật chế độ máy bay và tắt Wi-Fi, đóng/mở
   lại app, kiểm tra login/offline. Sau đó bật lại kết nối.
4. Lặp bài cập nhật bản mới; ghi iOS, thiết bị và kết quả.

Chưa có HTTPS không phải lỗi code đã xác định; đây là điều kiện nghiệm thu chưa
đáp ứng. Không đánh dấu toàn bộ nền móng Done khi phần kiểm thử bắt buộc còn thiếu.

<a id="ci-preview"></a>

## CI và preview

Đã thêm cấu hình và bài test; chưa có lần chạy GitHub Actions, deploy Cloudflare
hoặc nghiệm thu iPhone thật trong phiên này. Repo chưa có `.git`, chưa có
lockfile, môi trường agent không truy cập được npm registry/Docker Engine.
15 bài Node kiểm tra cấu hình/deploy/rollback đã chạy đạt; API Cloudflare trong
các bài này là giả lập, không phải bằng chứng rollback trên cloud.
Kiểm tra cú pháp các file mới và JSON đã đạt. `npm.cmd run check` hiện dừng ở
lint với lỗi `eslint is not recognized` vì chưa có `node_modules`; chưa chạy
được đầy đủ typecheck/Vitest/build/E2E trong môi trường này.

### Chạy trên máy tính

Từ thư mục dự án, cần Node 24 và kết nối npm registry:

```powershell
npm.cmd install
npm.cmd run check
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
```

`check` chạy ESLint, TypeScript (cả mã app, unit test và E2E), Vitest, Node tests
cấu hình/deployment, build frontend và dry-run bundle Worker. Không deploy cloud.
Commit `package-lock.json` do `npm install` tạo ra; các lần sau dùng `npm.cmd ci`.

E2E tự build frontend, áp dụng migration vào D1 **local test** riêng rồi mở
Workers tại `127.0.0.1:8788` và frontend preview tại `127.0.0.1:4173`.
Hai cổng này cần trống. Không cần tài khoản/token Cloudflare, không chạm D1 remote.
Không cần khởi động backend thủ công trước E2E.

| Bài kiểm | Môi trường |
|---|---|
| Login, hiện mật khẩu, route 404/lỗi render, icon/manifest, màn hình 320px | Chromium và WebKit với cấu hình iPhone 13 |
| `/api/health` đúng contract, no-store, CORS từ chối origin lạ/preflight | Workers và D1 local thật, gọi qua proxy frontend |
| Reload/deep link offline và không cache API | Chromium; bài SW này bỏ qua trên WebKit |
| DB lỗi/chưa migration → 503, lỗi không lộ nội dung nội bộ | Unit API |
| Target preview riêng, ghi version, deploy lỗi khôi phục version cũ | Node tests với Cloudflare giả lập |

Xem báo cáo bằng `npx.cmd playwright show-report`. WebKit chạy trong Playwright
giúp phát hiện lỗi engine; vẫn cần Safari và PWA trên iPhone thật theo
[tài liệu Playwright](https://playwright.dev/docs/browsers).

### Bật CI trên GitHub

Đưa dự án lên repository GitHub của bạn, gồm thư mục `.github/workflows`.
Nếu repo chưa bật Actions: vào **Settings → Actions → General** để bật.
Workflow **CI** tự chạy khi push, tạo/cập nhật PR, hoặc chạy tay trong tab Actions.

CI dùng Node 24 trên Ubuntu, chạy lint → typecheck → unit → build → E2E
Chromium/WebKit. Không cung cấp secret cloud cho CI. Report và trace được lưu
trong artifact `ci-browser-report`. Chỉ khi mọi bước đạt mới tạo `tested-build`
chứa `apps/frontend/dist` và `package-lock.json`.

Khi chưa có lockfile, CI dùng `npm install` và nhắc tải lockfile từ `tested-build`
để commit vào repo. Khi đã commit, CI chuyển sang `npm ci`. Chưa có lockfile thì
các lần chạy độc lập chưa được cố định cùng phiên bản dependencies.

Đánh dấu **lint/typecheck/unit chạy CI** sau khi có URL một run xanh và commit
SHA tương ứng. Có thể đặt job này làm required check trong branch protection.

### Thiết lập preview Cloudflare riêng

Preview phục vụ FE tĩnh và `/api/*` trong **cùng một Worker**, dùng một D1 riêng.
FE gọi API same-origin, `APP_ENV=test`. Cấu hình tại
`apps/backend/wrangler.preview.json`; không thay deployment dev/test/prod.
Routing dùng [Workers static assets SPA](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).

1. Trong Cloudflare, bật Workers và tạo/chọn subdomain `workers.dev` của tài khoản.
2. Tạo D1 tên `thu-chi-preview` (hoặc tên khác kết thúc bằng `-preview`), ghi lại
   Database ID. Không dùng lại database dev/test/prod.
3. Tạo Cloudflare API token phạm vi tài khoản này, có quyền **Workers Scripts: Edit**
   và **D1: Edit**. Lưu token dưới dạng secret GitHub, không gửi qua chat hay commit.
4. Trong GitHub **Settings → Environments**, tạo environment tên `preview`.
   Thêm secret và variables sau. Có thể giới hạn branch được deploy tại đây.

| Loại | Tên | Giá trị |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Token Cloudflare |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Account ID gồm 32 ký tự hex |
| Variable | `PREVIEW_D1_DATABASE_ID` | UUID D1 preview thật |
| Variable | `PREVIEW_ORIGIN` | `https://thu-chi-preview.<subdomain-cua-ban>.workers.dev` không có `/` cuối |
| Variable, tùy chọn | `PREVIEW_WORKER_NAME` | Mặc định `thu-chi-preview`, phải kết thúc `-preview` |
| Variable, tùy chọn | `PREVIEW_DATABASE_NAME` | Mặc định `thu-chi-preview`, phải trùng tên D1 đã tạo |

Mỗi preview này là môi trường dùng chung, chỉ giữ dữ liệu thử nghiệm. Code kiểm
tra ID/tên không trùng môi trường khác trong config và tên D1 thực trên Cloudflare.
Mỗi workflow deploy/rollback dùng cùng concurrency group để tránh chạy chồng nhau.

### Deploy và kiểm bản đang chạy

Vào **Actions → Deploy preview → Run workflow**, chọn branch chứa mã cần thử.
Workflow chạy lại CI, lấy **đúng frontend build và lockfile đã đạt** từ run đó,
cài công cụ kiểm tra, dry-run bundle kết hợp FE/API rồi mới migration D1 remote
và deploy Worker.

Script lưu version đang chạy vào `.preview/before.json`, kiểm tra health có
`environment=test`, database `ok`, header `X-Worker-Version` đúng version vừa
deploy, HTML là bản build, sau đó mở login trên Chromium/WebKit qua HTTPS.
Token chỉ truyền vào bước cloud; bài browser không nhận token.

Artifact `preview-release-<run-id>` có `release.json` (version, previousVersion,
commit, thời điểm xác minh), snapshot trước deploy và báo cáo browser.
Nếu script deploy hoặc browser smoke thất bại sau khi đã thay bản chạy, quy trình
thử phục hồi version cũ và kiểm lại. Run vẫn báo lỗi để điều tra bản vừa thất bại.
**Lần deploy đầu không có version cũ để phục hồi**; nếu lỗi phải sửa và deploy lại.
Nếu bị hủy cưỡng bức/mất runner, dùng workflow rollback thủ công.

Mở trên iPhone: **`<PREVIEW_ORIGIN>/login`**. Đây là URL HTTPS truy cập được ngoài
LAN sau khi bạn đã thực hiện deployment; hiện chưa có URL cloud thật được tạo.

### Diễn tập rollback trước nghiệm thu

1. Deploy bản A đạt; lưu `version` trong `release.json` và URL run.
2. Tạo bản B có một thay đổi giao diện nhỏ dễ nhận biết; deploy B đạt.
3. Vào **Actions → Rollback preview → Run workflow**, nhập UUID version của A.
4. Workflow xác nhận version thuộc đúng Worker preview, chuyển 100% traffic về A,
   kiểm header version/health, rồi chạy browser smoke qua HTTPS. Lưu artifact rollback.
5. Trên iPhone đang mở B, kiểm tra bản cập nhật bằng cách đưa app về nền rồi mở
   lại; khi thấy thông báo phiên bản mới, bấm **Cập nhật**. Xác nhận giao diện A.
   Tab/PWA đang chạy có thể giữ app shell cũ cho đến khi người dùng cập nhật.
6. Ghi kết quả tại [biên bản P00](#acceptance), gồm run A/B/rollback và version A.

Rollback khôi phục mã Worker và static assets; **không hoàn tác dữ liệu D1**.
Migration mới phải tương thích với phiên bản cũ được giữ để rollback. Không xóa
binding/database mà phiên bản cũ cần. Đây là giới hạn của
[Cloudflare Workers rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
Không đánh dấu rollback đạt chỉ dựa vào bài test giả lập.

### Tình trạng nghiệm thu

Bốn mục Test P00 chỉ chuyển `[x]` khi có bằng chứng tương ứng trong
[biên bản nghiệm thu](#acceptance). Cấu hình có sẵn không có nghĩa workflow,
điện thoại hoặc deployment thực đã được kiểm tra.

<a id="acceptance"></a>

## Nghiệm thu

Trạng thái ban đầu: **Chưa kiểm tra đầy đủ**. Điền từng kết quả và bằng chứng
thực tế; không dùng viewport giả lập thay kết quả Safari iPhone.

| Thông tin | Giá trị cần điền |
|---|---|
| Người kiểm tra / thời điểm | Chưa ghi |
| Commit SHA | Chưa ghi |
| URL run CI | Chưa chạy |
| Preview HTTPS origin | Chưa deploy |
| iPhone / phiên bản iOS / Safari | Chưa ghi |
| Run deploy A / version A | Chưa chạy |
| Run deploy B / version B | Chưa chạy |
| Run rollback về A | Chưa chạy |

| Checklist cần nghiệm thu | Điều kiện đạt | Kết quả / bằng chứng |
|---|---|---|
| Lint/typecheck/unit chạy CI | Các bước CI xanh trên commit được ghi, có report E2E | Chưa kiểm tra |
| FE mở trên iPhone Safari | Login hiện đúng, không trắng, nhập bàn phím/ẩn hiện mật khẩu, không tràn ngang | Chưa kiểm tra |
| API health | HTTP 200, đúng contract, `environment=test` trên preview, database `ok`, `Cache-Control: no-store` | Chưa kiểm tra |
| Deploy preview và rollback | A → B → A thực trên cloud, header version trùng A, health và browser smoke xanh | Chưa kiểm tra |

### Kiểm tra iPhone qua HTTPS

1. Dùng Safari trên iPhone iOS 26+ mở `<PREVIEW_ORIGIN>/login`. Nhập tên thử và
   mật khẩu thử, ẩn/hiện mật khẩu, kiểm tra bố cục khi bàn phím mở và xoay màn hình.
   Không dùng tài khoản/mật khẩu thật; P00 mới có giao diện đăng nhập.
2. Mở `/setup`, bấm **Kiểm tra kết nối**, kết quả đã kết nối backend.
   Mở `/api/health` để lưu ảnh kết quả JSON và đối chiếu với report CI.
3. Safari → Chia sẻ → **Thêm vào Màn hình chính**. Mở từ icon, xác nhận icon và
   giao diện standalone; chụp lại màn hình làm bằng chứng.
4. Đợi app lưu giao diện offline, mở online thêm lần nữa. Bật chế độ máy bay và
   tắt Wi-Fi, đóng rồi mở PWA từ icon. Login và trang offline phải hiện được,
   có thông báo mất mạng. Không được báo đã đăng nhập/kết nối backend.
5. Bật mạng, giữ form đang nhập rồi deploy B. Khi app báo có bản mới, giá trị
   đang nhập không tự mất; chỉ reload sau khi chọn **Cập nhật**.
6. Làm rollback drill trong [hướng dẫn CI/preview](#ci-preview), kiểm
   lại trên cả tab Safari mới và PWA đã cài sau khi cập nhật.

| Bài iPhone bổ sung | Kết quả / ảnh / ghi chú |
|---|---|
| Bàn phím, password, xoay màn hình | Chưa kiểm tra |
| Add to Home Screen / icon / standalone | Chưa kiểm tra |
| Offline đóng mở lại | Chưa kiểm tra |
| Cập nhật không tự reload form | Chưa kiểm tra |
| Giao diện A sau rollback và cập nhật | Chưa kiểm tra |

Ghi lỗi còn lại, URL run/ảnh và cách tái hiện tại đây trước khi ký nghiệm thu.
