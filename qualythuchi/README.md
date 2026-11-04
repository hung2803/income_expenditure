# Quản lý thu chi

Monorepo npm workspaces cho PWA iPhone và Cloudflare Workers API.

```text
apps/
  frontend/
    public/                 # Static assets, PWA icon
    src/
      app/                  # Router, layout, providers
      components/           # Shared UI; shadcn Button, Card, Input
      features/             # Screens and feature-specific state/forms
      domain/               # Framework-independent entities and use cases
      infrastructure/       # API, Dexie, sync, backup, notifications
      workers/              # Custom service worker handlers when needed
  backend/
    migrations/             # D1 migrations
    src/
      index.ts              # Worker entry point
      app.ts                # Routing, CORS, error handling
      modules/              # Routes/services/repositories per business feature
      middleware/           # Authentication and authorization in P01
      infrastructure/       # D1, Google Drive, Web Push adapters
packages/
  contracts/src/            # Shared API types; no secrets or database models
docs/                       # Requirements, design, roadmap
```

## Chạy bằng Docker

Cài và mở Docker Desktop, chọn Linux containers. Không cần cài Node.js trên máy
khi chạy bằng Docker. Lần build đầu cần mạng để tải Node image và thư viện npm.

```powershell
docker compose up -d --build --wait
```

- Frontend (đăng nhập): http://localhost:5173
- Trang kiểm tra kết nối: http://localhost:5173/setup
- Backend health: http://localhost:8787/api/health
- Frontend proxy `/api` tới service `backend` trong mạng Docker.
- Backend tự áp dụng migration D1 local trước khi khởi động. Frontend có thể chạy
  độc lập để xem UI khi backend chưa sẵn sàng. Không cần tài khoản Cloudflare
  hoặc Google để chạy scaffold local.
- Dữ liệu D1 nằm trong named volume `d1-data`, được giữ qua restart và
  `docker compose down`. IndexedDB của frontend vẫn nằm trong trình duyệt.

```powershell
docker compose logs -f
docker compose restart
docker compose down
```

Sau khi sửa code, chạy lại `docker compose up -d --build --wait`; cấu hình này
đóng gói mã nguồn trong image, không mount thư viện Windows vào Linux container.
Muốn xóa toàn bộ dữ liệu D1 local để chạy lại từ đầu, dùng
`docker compose down -v` (lệnh này xóa volume dữ liệu).

Docker hiện build frontend thành các file tĩnh rồi phục vụ bằng Vite preview,
backend dùng Workers runtime local. Không dùng Vite dev optimizer trong Docker.
Cấu hình hosting production/HTTPS và kiểm thử PWA iPhone sẽ triển khai riêng. Frontend mở cổng 5173
trên mạng LAN; cổng backend 8787 vẫn chỉ truy cập trực tiếp từ máy tính.

## Mở giao diện trên điện thoại qua Wi-Fi

Máy tính có thể dùng Ethernet, điện thoại dùng Wi-Fi, miễn cùng router/mạng LAN.
Mở Docker Desktop rồi chạy từ thư mục dự án:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-mobile.ps1
```

Mặc định script chỉ build/start frontend, kiểm tra HTML rồi in địa chỉ LAN để mở
trên điện thoại. Thêm `-IncludeBackend` vào cuối lệnh nếu muốn chạy cả backend và
kiểm tra API. `ExecutionPolicy Bypass` chỉ áp dụng tiến trình PowerShell này.
Cũng có thể dùng lệnh Docker trực tiếp để xem giao diện:

```powershell
docker compose up -d --build --wait frontend
ipconfig
```

Trên iPhone, dùng Safari mở `http://<IPv4-của-máy-tính>:5173`. Ví dụ địa chỉ máy
tính khi thiết lập là `http://192.168.1.12:5173` (IP có thể thay đổi). Không nhập
`localhost` trên điện thoại. Trang mở đầu là giao diện đăng nhập theo mẫu trong
`screen/Vietnamese Finance App Login Screen.png`; `/login` cũng mở màn hình này.
Hiện chỉ dựng UI: nút hiện/ẩn mật khẩu hoạt động, các thao tác đăng nhập,
Passkey, Apple ID và quên mật khẩu hiển thị thông báo chưa kết nối hệ thống.
Để kiểm tra frontend gọi được backend, mở `/setup` và nhấn **Kiểm tra kết nối**.

Nếu Safari không mở được, trước hết kiểm tra `http://localhost:5173` ngay trên
máy tính. Nếu máy tính cũng không mở được, ứng dụng chưa chạy: xem
`docker compose ps -a` và `docker compose logs --tail 100 frontend` để xác định
lỗi build/start; chưa cần chỉnh Firewall hay Safari ở bước này.

Nếu trang mở nhưng trắng và trình duyệt báo `504 Outdated Optimize Dep`, container
đang chạy bản Vite dev cũ. Docker hiện phục vụ bản build tĩnh, không tải
`/node_modules/.vite/...` lúc mở trang. Áp dụng thay đổi bằng:

```powershell
docker compose up -d --build --force-recreate --wait frontend
```

Sau đó mở `http://localhost:5173/login` và nhấn `Ctrl+Shift+R`.

Nếu build cũ báo `EACCES: permission denied, mkdir '/app/apps/frontend/dist'`,
nguyên nhân là quyền ghi thư mục trong image. Dockerfile hiện chuẩn hóa quyền
owner bằng `chmod -R u+rwX /app` trước khi chuyển sang user `node`; không cần
đổi thuộc tính thư mục Windows hoặc chạy ứng dụng bằng root. Build lỗi sẽ không
thay container cũ, nên cần build thành công rồi tạo lại container.

Nếu máy tính mở được nhưng điện thoại không mở được: kiểm tra cùng mạng, tránh
Wi-Fi khách có chặn thiết bị với nhau. Với mạng gia đình được đặt là **Private**,
nếu Windows Firewall chặn cổng 5173, mở PowerShell **Run as Administrator** và chạy
một lần quy tắc chỉ cho phép mạng nội bộ:

```powershell
New-NetFirewallRule -DisplayName 'Thu Chi frontend LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private -RemoteAddress LocalSubnet
```

Truy cập HTTP qua LAN dùng để xem giao diện online. Service worker/offline,
WebAuthn/passkey và Web Push cần HTTPS tin cậy; service worker cũng chưa bật ở
Vite dev. Muốn kiểm thử PWA đầy đủ cần build, host qua HTTPS và cấu hình bổ sung.

## Chạy trên Windows

Yêu cầu Node.js 22.12+ (đang kiểm tra với Node 24), npm và trình duyệt hiện đại.
Nếu PowerShell chặn `npm.ps1`, dùng `npm.cmd` như các lệnh dưới đây.

```powershell
npm.cmd install
npm.cmd run db:migrate:local
npm.cmd run dev
```

- Frontend: http://127.0.0.1:5173
- Backend: http://127.0.0.1:8787/api/health
- Vite proxy `/api` sang Worker local. Mở `/setup` và nhấn **Kiểm tra kết nối** để thử frontend → backend.
- Chạy riêng: `npm.cmd run dev:frontend` hoặc `npm.cmd run dev:backend`.
- `.env.example` và `.dev.vars.example` là mẫu; mặc định local không cần sao chép.

## Kiểm tra và build

```powershell
npm.cmd run check
```

Gồm ESLint, TypeScript, API tests và build cả hai ứng dụng. E2E nền móng frontend:

```powershell
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
```

Backend build là
`wrangler deploy --dry-run --env dev`, không triển khai lên Cloudflare. Sau khi sửa binding
trong `wrangler.jsonc`, cập nhật kiểu `Env` ở `apps/backend/src/env.d.ts`.
Frontend build ra `apps/frontend/dist`, backend bundle ra `apps/backend/dist`.

## Ranh giới kiến trúc

- Frontend feature gọi domain/use case và repository; adapter API/IndexedDB nằm
  trong infrastructure. Chưa tạo bảng Dexie hoặc hàng đợi sync trước P05.
- Backend chia module theo nghiệp vụ: auth, users, wallets, categories,
  transactions, transfers, budgets, sync, audit, notifications, savings,
  recurring, reports và backups. Chỉ health module có API hoạt động ở bước này.
- `packages/contracts` chứa request/response dùng chung; import bằng
  `@thu-chi/contracts`. Backend xác minh session và quyền riêng ở các phase sau.
- Tài chính đồng bộ qua Workers/D1; Drive tập trung của Super Admin lưu backup
  mã hóa có phiên bản qua server. Không đưa token Google vào frontend.

## PWA và triển khai sau

Build frontend tạo manifest và service worker precache app shell; không cấu hình
runtime cache cho `/api`. Service worker không bật trong dev. Kiểm tra bản build
bằng `npm.cmd run preview -w @thu-chi/frontend`; preview cũng proxy `/api` sang
backend local (hoặc địa chỉ `API_PROXY_TARGET` trong Docker). Nếu dùng
`VITE_API_BASE_URL` để gọi backend khác origin, cần thêm origin frontend vào CORS.

Đã có PNG 192/512, maskable icon và apple-touch-icon 180. Root layout hiển thị
trạng thái mạng và thông báo bản mới có nút Cập nhật; SW chỉ cache app shell.
Trang `/offline` hiển thị trạng thái mạng, các đường dẫn lạ có trang 404.
Vẫn cần kiểm thử HTTPS và cập nhật service worker trên iPhone thật.
Chưa có Web Push, passkey, đăng nhập hoặc nghiệp vụ thu chi.

shadcn/ui đã cấu hình thủ công tại `apps/frontend/components.json`. Sau khi cài
dependencies, có thể thêm component từ repo root bằng
`npx.cmd shadcn@latest add <component> -c apps/frontend`.

Chi tiết phạm vi, build-time env và tiêu chí kiểm thử ở
[docs/p00-acceptance.md#frontend](docs/p00-acceptance.md#frontend).

Backend đã có named environment dev/test/prod, D1 namespace riêng và health API
kiểm tra schema migration: `200 ok` khi DB sẵn sàng, `503 degraded` khi chưa sẵn
sàng. Chạy `docker compose up -d --build --force-recreate --wait backend` rồi mở
http://localhost:8787/api/health. Các script remote chặn database ID mẫu và nhầm
môi trường; chưa tạo tài nguyên cloud. Hướng dẫn CORS, secrets, migration và kiểm
thử ở [docs/p00-acceptance.md#backend](docs/p00-acceptance.md#backend).

`database_id` trong Wrangler là placeholder dành cho local. Trước triển khai,
tạo D1 thực, cấu hình riêng dev/test/prod, gắn ID thật, đặt CORS chính xác, secret
và route `/api` trên cùng origin (hoặc cấu hình API origin khác). Không chạy
migration remote bằng cấu hình local. Chưa tạo tài nguyên hoặc deploy cloud.

Kế hoạch nghiệp vụ nằm trong [docs/implementation-phases.md](docs/implementation-phases.md).
Scaffold này là phần khởi đầu P00; CI, preview cloud và UAT iPhone chưa nghiệm thu.

Đã cấu hình GitHub Actions cho lint/typecheck/unit/build và E2E Chromium/WebKit
với Workers/D1 local thật. Workflow deploy preview đóng gói FE + API cùng Worker,
lưu version và có workflow rollback. Xem [thiết lập CI/preview](docs/p00-acceptance.md#ci-preview)
và [biên bản nghiệm thu P00](docs/p00-acceptance.md). Cần đưa repo lên GitHub,
cấu hình environment `preview` và chạy thực trước khi đánh dấu các mục Test đạt.

Trong môi trường agent hiện tại chưa cài được dependencies do truy cập npm
registry bị chặn (`EACCES`). Chưa có lockfile và chưa chạy đủ lint/typecheck/Vitest/build;
chạy `npm.cmd install` rồi `npm.cmd run check` khi có kết nối registry.
