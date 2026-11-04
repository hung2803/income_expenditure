# Quản lý thu chi

Ứng dụng quản lý thu chi cá nhân dạng PWA, giao diện tiếng Việt, hướng tới cài từ Safari lên màn hình chính iPhone. Monorepo npm workspaces gồm React frontend, Cloudflare Workers API và kiểu dữ liệu dùng chung.

> Hiện trạng 04/11/2026: đã triển khai nghiệp vụ đến **P10** và chạy được local Windows/Docker. Các phần còn lại được chia thành **N00–N07** trong [kế hoạch và checklist](docs/implementation-phases.md). Chưa đủ bằng chứng nghiệm thu production hoặc Safari/PWA iPhone thực tế.

Đọc [AGENTS.md](AGENTS.md) để hiểu luồng nghiệp vụ, phân quyền, cách tính số dư và giới hạn đồng bộ.

## Chức năng hiện có và phần còn thiếu

| Nhóm | Hiện trạng |
|---|---|
| Đăng nhập và phân quyền | Username/password, phiên cookie, CSRF, USER/SUPER_ADMIN, kiểm tra chủ dữ liệu tại backend |
| Ví và danh mục | Thêm/sửa/xóa theo ràng buộc; số dư ban đầu, danh mục thu/chi |
| Thu chi | Thêm/sửa/xóa, hoàn tác 10 giây, ghi chú, nhãn, ngày giờ |
| Chuyển ví, dashboard và lịch | Số dư, thu/chi, ngân sách, hóa đơn và tiết kiệm trên Trang chủ; tab Lịch `/calendar` xem được tháng trước/sau, chọn ngày hiện tổng thu/chi và giao dịch ngay bên dưới; chuyển ví không tính vào thu/chi |
| Offline/sync | IndexedDB riêng theo tài khoản, outbox, push/pull, retry, chống trùng và phát hiện xung đột |
| Quản trị | Tài khoản, tài chính theo User trong các màn hình đã có, nhật ký quản trị |
| Ngân sách | Theo tháng/tổng/danh mục, tiến độ và sự kiện cảnh báo 80%/100% |
| Báo cáo/tìm kiếm | Bộ lọc giao dịch, biểu đồ, tổng hợp theo chủ dữ liệu và múi giờ |
| Tiết kiệm/định kỳ | Mục tiêu, đóng góp, tiến độ; lịch ngày/tuần/tháng và xác nhận từng kỳ |
| Thông báo/Passkey | Có API/UI và test tự động; cần cấu hình và kiểm chứng iPhone/origin thực tế |
| Google Drive, OCR, PDF | Chưa triển khai hoàn chỉnh; lần lượt thuộc N03, N05, N06 |

Có mã nguồn và test tự động không đồng nghĩa đã nghiệm thu mọi luồng sử dụng trên thiết bị thật.

Trên điện thoại, ở đầu trang **kéo xuống đến “Thả để làm mới”, rồi thả tay** để tự tải dữ liệu màn hình. Giữ nội dung, vị trí cuộn, bộ lọc và bản nháp; offline/API lỗi có thông báo và giữ dữ liệu đang hiển thị. Không cần bấm Cập nhật để lấy dữ liệu. Nút Cập nhật PWA dành riêng cho phiên bản mã ứng dụng mới; cử chỉ không chiếm thao tác nhập liệu/hộp thoại hoặc vùng cuộn riêng.

## Thư mục dự án và công nghệ

Đường dẫn hiện tại trên máy Windows:

```text
C:\Users\User\Documents\income_expenditure\qualythuchi
```

Tất cả lệnh bên dưới chạy từ thư mục này, trừ khi ghi rõ terminal khác. Nếu đặt dự án ở vị trí khác, thay đường dẫn tương ứng.

```powershell
Set-Location -LiteralPath 'C:\Users\User\Documents\income_expenditure\qualythuchi'
```

```text
AGENTS.md                         # Luồng nghiệp vụ và bản đồ mã nguồn
apps/frontend/
  src/app/                        # Router, layout, bảo vệ trang
  src/features/                   # Auth, account, admin, finance, notifications
  src/infrastructure/api/         # Gọi API
  src/infrastructure/sync/        # IndexedDB và đồng bộ
  public/                         # Icon PWA và push service worker
apps/backend/
  src/app.ts                      # Đăng ký API Hono
  src/modules/                    # Auth, users, finance, notifications, health
  src/middleware/                 # Phiên, CSRF, vai trò và chủ dữ liệu
  migrations/                     # D1 schema, hiện đến 0012
  scripts/                        # Local, cloud, bootstrap và cấu hình
  test/                           # Kiểm thử backend
packages/contracts/src/           # Request/response và kiểu dùng chung
e2e/                              # Playwright Chromium/WebKit
.github/workflows/                # CI, preview và rollback preview
docs/                             # Yêu cầu, thiết kế, kế hoạch, hướng dẫn triển khai
```

Frontend dùng React 19, TypeScript, Vite, Tailwind CSS 4, React Router, lucide-react và các component shadcn/ui. Backend dùng Hono, Cloudflare Workers/D1. Lưu offline dùng IndexedDB native; một số phần frontend còn dùng localStorage theo tài khoản. Không mặc định các thư viện được đề xuất trong tài liệu thiết kế đều đã tích hợp.

## Chạy local nhanh khi phát triển (Windows)

Dùng **Node 24** (đã kiểm tra 24.21.0), npm 11 và dependencies cài sẵn (`npm.cmd ci` khi cài lần đầu/đổi lockfile). Không cài lại dependencies hoặc build production mỗi lần sửa code.

```powershell
npm.cmd run dev:local
# Hoặc chạy riêng:
npm.cmd run dev:api
npm.cmd run dev:web

npm.cmd run dev:status
npm.cmd run dev:logs
npm.cmd run dev:stop
```

Các lệnh trả terminal sau khi sẵn sàng. Frontend là **Vite dev/HMR** ở http://127.0.0.1:5173; backend là **Wrangler dev** ở 8787. Proxy `/api` và `/auth` cùng origin. Mode `localdev` ép API về local để không dùng nhầm biến API cloud. Tiến trình Windows chạy cửa sổ ẩn; PID và thời điểm bắt đầu lưu trong `.preview/local/state.json`, log riêng `web.stdout.log`, `web.stderr.log`, `api.stdout.log`, `api.stderr.log` cùng thư mục. Đọc log trực tiếp:

```powershell
Get-Content .preview/local/web.stdout.log -Tail 40 -Wait
Get-Content .preview/local/api.stdout.log -Tail 40 -Wait
```

**Dữ liệu hiện tại ở Docker**: launcher Auto nhận diện container/volume `thu-chi_d1-data`, giữ backend trong Docker và mount mã qua `compose.local.yaml` để tự reload. Frontend chạy native nhẹ hơn. Không có build/migrate/seed/reset trong lệnh start; lần đầu chưa có image thì build backend riêng bằng `docker compose build backend`. Giữ Docker Desktop mở. Backend image có sẵn không phải build lại khi chỉ sửa source; thay dependencies/runtime mới cần build lại.

Launcher kiểm tra cổng, PID/thời điểm tạo và khóa start/stop; gọi lại sẽ dùng tiến trình đang chạy, không tự giết server khác. Nếu frontend preview Docker cũ đang chiếm 5173, dừng rõ ràng bằng `docker compose stop frontend` trước. Không chạy các bộ native/Docker khác trên cùng cổng.

**Native toàn bộ là lựa chọn riêng** sau khi dừng bộ hiện tại:

```powershell
npm.cmd run dev:stop
npm.cmd run dev:api -- -ApiMode Native
npm.cmd run dev:web
```

Native dùng `apps/backend/.wrangler/state`, khác volume Docker; tài khoản/dữ liệu không tự chuyển qua. Với database native mới, migration và bootstrap là bước chuẩn bị có chủ đích ở mục tài khoản bên dưới. Nếu schema chưa sẵn sàng, launcher báo lỗi, không tự tạo lại database. Trở lại dữ liệu Docker bằng `npm.cmd run dev:stop`, rồi `npm.cmd run dev:api -- -ApiMode Docker` và `npm.cmd run dev:web`.

Không tự chạy tác vụ lịch trong dev. Nếu chủ động cần thử scheduler (có thể tạo thông báo), backend có endpoint `/cdn-cgi/local/scheduled`; không gọi như một health check. Service worker không đăng ký trong Vite dev; dùng bản production preview để kiểm chứng PWA.

Dev vẫn phục vụ manifest JSON với `display: standalone`, `scope: /` và meta ứng dụng cho iPhone; tất cả tab cùng origin. Để dùng giao diện ứng dụng trên iPhone, thêm link gốc HTTPS vào Màn hình chính và mở biểu tượng đó. Khi mở như trang Safari thông thường, thanh công cụ là UI của Safari, không thể hứa ẩn bằng CSS. Cấu hình này dựa trên [hướng dẫn Apple](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html) và [phạm vi manifest W3C](https://www.w3.org/TR/appmanifest/#scope-member); vẫn cần xác minh trên iPhone thật. Không xóa dữ liệu website hoặc database để sửa bố cục.

Số đo, cách kiểm chứng HMR/proxy/database và giới hạn: [báo cáo local](docs/local-performance.md).

## Bản build preview bằng Docker

Cài và mở Docker Desktop, dùng Linux containers. Không cần Node.js trên Windows nếu chỉ chạy ứng dụng bằng Docker. Lần build đầu cần mạng tải image và dependencies.

```powershell
docker compose up -d --build --wait --wait-timeout 180 frontend backend
docker compose ps
```

| Địa chỉ | Mục đích |
|---|---|
| http://localhost:5173/login | Đăng nhập ứng dụng |
| http://localhost:5173/setup | Kiểm tra frontend kết nối backend |
| http://localhost:5173/api/health | Health qua frontend proxy |
| http://127.0.0.1:8787/api/health | Health backend trực tiếp |

Frontend phục vụ bản build bằng Vite preview, proxy cả `/api` và `/auth` tới backend. Backend tự áp dụng migration local khi khởi động. Không cần tài khoản Cloudflare/Google để dùng nghiệp vụ local thông thường; Web Push cần cấu hình riêng.

```powershell
docker compose logs --tail 100 frontend backend
docker compose restart
docker compose down
```

Bộ mặc định phục vụ bản build cố định, dùng khi kiểm chứng preview/PWA; khi phát triển dùng các lệnh dev ở trên. Nếu cần cả frontend trong Docker có HMR, dùng `docker compose -f compose.yaml -f compose.dev.yaml -f compose.local.yaml up -d --build frontend backend` sau khi dừng frontend native; chỉ build lần đầu/đổi dependencies. Các file source được mount, dependencies Linux giữ trong image. `docker compose down` giữ named volume D1; không dùng `down -v` để restart vì sẽ xóa dữ liệu.

Frontend mở cổng 5173 ra LAN; backend 8787 chỉ bind loopback trên máy tính.

## Chạy trực tiếp trên Windows

Dùng Node.js **24** để khớp môi trường đã kiểm tra và Docker; package khai báo tối thiểu 22.12 nhưng không coi mọi phiên bản cũ đã được kiểm chứng. Trong PowerShell dùng `npm.cmd`/`npx.cmd` để tránh lỗi chặn `npm.ps1`.

Nếu Docker đang chạy, dừng hai service trước khi khởi động native vì dùng chung cổng 5173/8787. Dữ liệu volume được giữ lại:

```powershell
docker compose stop frontend backend
```

```powershell
npm.cmd ci
npm.cmd run db:migrate:local
npm.cmd run dev
```

Frontend ở http://127.0.0.1:5173, backend ở http://127.0.0.1:8787. Có thể chạy riêng `npm.cmd run dev:frontend` và `npm.cmd run dev:backend` trong hai terminal.

Khi chuyển lại Docker, dừng tiến trình `npm.cmd run dev` bằng `Ctrl+C` và xác nhận kết thúc batch nếu PowerShell hỏi, rồi chạy lệnh Docker ở mục trên. Không chạy native và Docker đồng thời trên cùng cổng.

Để thử bản build/PWA local, chạy backend, build frontend rồi mở preview trong terminal khác:

```powershell
npm.cmd run build -w @thu-chi/frontend
npm.cmd run preview -w @thu-chi/frontend
```

Service worker không bật trong Vite dev. Localhost phục vụ phát triển; kiểm chứng PWA/Passkey/Push trên iPhone cần HTTPS tin cậy.

Nếu vừa chuyển vị trí dự án, junction trong `node_modules/@thu-chi` có thể vẫn trỏ tới thư mục cũ. Cài lại bằng `npm.cmd ci`, rồi kiểm tra:

```powershell
npm.cmd ls --workspaces --depth=0
Get-ChildItem -LiteralPath node_modules/@thu-chi | Select-Object Name,LinkType,Target
npm.cmd run typecheck
```

Ba link phải trỏ về `apps/backend`, `apps/frontend`, `packages/contracts` trong thư mục dự án hiện tại. Các junction trên máy hiện tại đã được sửa và typecheck Windows đã đạt.

## Tài khoản đầu tiên và database đang sử dụng

Không có đăng ký công khai hoặc mật khẩu mặc định. Nếu database hoàn toàn mới, đã áp dụng migration và chưa bootstrap, tạo Super Admin bằng CLI nhập mật khẩu ẩn:

```powershell
# Khi dùng Docker
docker compose exec backend npm run auth:bootstrap -- --local dev
```

Hoặc với database Windows native:

```powershell
npm.cmd run auth:bootstrap -w @thu-chi/backend -- --local dev
```

CLI chỉ tạo Admin đầu tiên khi database chưa có tài khoản và chưa bootstrap; không dùng nó để reset mật khẩu tài khoản đã tồn tại. Admin cấp User mới và đổi mật khẩu qua khu vực quản trị. Nếu mất quyền đăng nhập Admin, cần quy trình recovery của người vận hành; chưa có luồng quên mật khẩu tự phục vụ hoàn chỉnh. Bootstrap remote/production chưa được bật trong CLI này.

| Môi trường | Nơi lưu | Ghi chú |
|---|---|---|
| Windows dev | `apps/backend/.wrangler/state` | CLI local dev và Worker native dùng dữ liệu này |
| Windows test | `apps/backend/.wrangler/test` | Môi trường test riêng, có dữ liệu seed test |
| Docker dev | Named volume `d1-data`, mount vào `/app/apps/backend/.wrangler` | Dev state nằm dưới `.wrangler/state` trong container; độc lập với thư mục Windows |
| Cloud | D1 binding theo môi trường Wrangler | Không tự nhận dữ liệu local; chưa xác minh trạng thái cloud trong phiên kiểm tra này |
| Trình duyệt | IndexedDB/localStorage theo tài khoản và origin | Dữ liệu chưa sync chỉ có trên thiết bị đó |

Tài khoản tồn tại ở database Docker không tự xuất hiện khi chạy backend native, test hoặc cloud. Khi không tìm thấy tài khoản, kiểm tra đúng backend/database trước khi tạo lại. Không lưu mật khẩu thật trong README hoặc commit dữ liệu tài khoản.

## Mở trên điện thoại và HTTPS tunnel

Qua LAN, máy tính và điện thoại cần cùng mạng. Dùng script chạy đủ frontend/backend và in địa chỉ LAN:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-mobile.ps1 -IncludeBackend
```

Safari mở `http://<IPv4-máy-tính>:5173`, không dùng localhost của điện thoại. HTTP LAN chỉ để thử các luồng online, không đủ cho PWA/Passkey/Push. Nếu máy tính mở được nhưng điện thoại không mở được, kiểm tra Wi-Fi khách/cô lập thiết bị và Windows Firewall. Script mặc định không có `-IncludeBackend` chỉ khởi chạy frontend.

Để mở HTTPS qua Cloudflare Quick Tunnel, cài sẵn `cloudflared`, bảo đảm ứng dụng local đang chạy rồi dùng terminal riêng:

```powershell
cloudflared tunnel --url http://127.0.0.1:5173 --no-autoupdate
```

Mở URL `https://...trycloudflare.com` in trong terminal. Kiểm tra `/api/health` trên chính URL đó. Giữ terminal và Docker/backend hoạt động; `Ctrl+C` dừng tunnel. Nếu chạy tunnel nền, dừng đúng tiến trình/PID đã khởi tạo.

Quick Tunnel có URL tạm; mở lại có thể đổi hostname. Cookie và IndexedDB tách theo origin, Passkey gắn với RP ID/origin: không coi localhost, LAN và hai URL tunnel là cùng một phiên/dữ liệu cục bộ. URL mới cần đăng nhập lại; dữ liệu chưa sync ở origin cũ không tự chuyển sang origin mới. Dùng hostname ổn định khi nghiệm thu lâu dài.

Proxy dev/preview đã có xử lý HTTPS forwarding cho Cloudflare/Pinggy; giữ `/auth` và `/api` đi qua cùng frontend. `scripts/start-pinggy.ps1` là lựa chọn Pinggy riêng, không phải script Cloudflare.

## Cấu hình và kiểm tra lỗi thường gặp

- Để `VITE_API_BASE_URL` rỗng khi dùng proxy cùng origin; nếu tách API origin, giá trị chỉ là origin backend, không thêm `/api`, và cần cấu hình CORS/cookie phù hợp.
- `API_PROXY_TARGET` mặc định `http://127.0.0.1:8787`; Docker dùng `http://backend:8787`.
- `APP_ENV`, `CORS_ORIGINS`, D1 binding nằm trong `apps/backend/wrangler.jsonc`; khi đổi binding, đối chiếu `src/env.d.ts`.
- Secrets local ưu tiên `.dev.vars.dev`/`.dev.vars.test`; file thật được ignore. Docker nhận `.dev.vars.dev` qua env_file nếu có. Xem cấu hình Web Push trong [hướng dẫn triển khai](docs/cloudflare-production-deployment.md).
- Không đặt secret/OAuth token/mật khẩu/recovery key vào `VITE_*`. Một số chú thích trong file env mẫu còn theo P00; không dùng chúng để kết luận các chức năng sau P00 chưa có.

| Triệu chứng | Kiểm tra |
|---|---|
| Không mở được frontend | `docker compose ps -a`, log frontend, cổng 5173 có bị tiến trình khác dùng |
| Health `503 degraded` | Log backend và migration/schema của đúng database; hiện schema yêu cầu là 12 |
| Không tìm thấy tài khoản | Đối chiếu Docker/native/test/cloud trong bảng database |
| Cookie thiếu khi chưa đăng nhập | Là trạng thái bình thường; giao diện hiện tại không cảnh báo lỗi ở lần mở đầu |
| Đúng mật khẩu nhưng cookie không được gửi lại | Giữ nguyên origin, kiểm tra proxy `/auth`, HTTPS forwarding và cookie của website; phân biệt lỗi session hết hiệu lực |
| UI cũ sau rebuild | Chờ build/start thành công, tải lại; với PWA chọn Cập nhật khi có phiên bản mới |
| Vẫn thấy UI cũ sau chuyển sang Vite dev | Mở `/auth/dev-refresh` trên đúng origin đang dùng (localhost hoặc link TryCloudflare). Trang này bỏ đăng ký service worker cũ rồi mở lại dashboard, giữ cookie/IndexedDB/localStorage; không xóa dữ liệu website. Chỉ có trong Vite dev |
| `504 Outdated Optimize Dep` | Tải lại trang sau lần Vite tối ưu dependencies; kiểm tra chỉ một server ở 5173 và không mount node_modules Windows vào Docker |
| Typecheck không tìm thấy contracts | Kiểm tra junction/cài lại workspace như hướng dẫn Windows |
| Agent build báo EPERM/Access denied | Wrangler có thể cần ghi log ngoài workspace/đọc thư mục bị sandbox chặn; chạy lệnh trong terminal được phép hoặc cấp quyền cần thiết |

## Kiểm thử và build

```powershell
npm.cmd run check
```

Lần lượt chạy lint, typecheck, toàn bộ unit/integration/config test rồi build các workspace. Có thể chạy riêng `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run build`.

Backend build chạy `wrangler deploy --dry-run --env dev --outdir dist`, **không deploy cloud**. Output ở `apps/backend/dist`; frontend/PWA ở `apps/frontend/dist`.

Lần nghiệm thu N00 ngày 04/11/2026, 10:31–10:32 +07:00, sau sửa workspace và chạy lại npm ci: **npm.cmd run check chạy liền mạch đạt mã 0** trên Windows x64/PowerShell, Node v24.21.0, npm 11.19.0. Lint/typecheck đạt, **76 test Vitest + 57 test backend/config đạt**, build Workers và frontend/PWA đạt. Không còn lỗi import contracts do đường dẫn cũ. Chạy ngoài sandbox với quyền cần thiết cho Wrangler; không deploy cloud. Bảng lệnh/kết quả nằm ở mục bằng chứng đóng N00 trong [kế hoạch](docs/implementation-phases.md).

Sau bổ sung hai thẻ dashboard và sửa nút Thêm giao dịch cùng ngày: lint/typecheck đạt, npm test đạt **81 Vitest + 57 backend/config**, build frontend/PWA và cập nhật Docker đạt. Chunk chính hiện 528,14 kB vẫn có cảnh báo kích thước/import sync-storage; kết quả E2E mới nhất bên dưới.

Lượt mới nhất sau thêm kéo xuống tải lại (04/11/2026): lint/typecheck đạt, npm test **84 Vitest + 57 backend/config** đạt; 3 unit test gesture và 6 E2E riêng của thao tác mới đạt. Build frontend/PWA đạt, chunk chính hiện 531,44 kB còn cảnh báo; frontend Docker được cập nhật.

E2E là bước riêng:

```powershell
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
```

Playwright dùng Workers/D1 **test** ở 8788 và frontend preview ở 4173, áp dụng migration/seed test theo cấu hình; không dùng database dev để chạy E2E. Lượt 04/11/2026 sau bổ sung dashboard/kéo xuống tải lại chạy `npm.cmd run test:e2e -- --workers=1` đạt mã 0: Chromium 26 đạt, WebKit 24 đạt/2 bỏ qua, không lỗi/flaky. Hai bài bỏ qua là service worker offline và Passkey virtual authenticator trên WebKit; các luồng này được kiểm tra tự động trên Chromium, chưa nghiệm thu iPhone thật. Cử chỉ kéo xuống dùng Input CDP trên Chromium; WebKit kiểm tra các handler bằng sự kiện DOM.

Báo cáo [HTML](playwright-report/index.html) và [JSON](test-results/e2e-results.json) được sinh local; mở bằng `npx.cmd playwright show-report playwright-report`. Khi lỗi, Playwright giữ ảnh và trace trong `test-results/`. Các lượt lỗi trước khi sửa fixture/proxy được lưu trong `.preview/e2e/`. Các artifact này được ignore, cần lưu/chia sẻ riêng nếu muốn giữ qua máy khác.

Health, auth-runtime, CRUD ví/danh mục, Passkey và dashboard có 17 bài dùng API thật (2 bài dashboard chèn lỗi vận chuyển cho API định kỳ); 18 bài trong `auth.spec.ts` vẫn giả lập auth để thử UI/trạng thái lỗi, 15 bài còn lại kiểm tra nền tảng/router/PWA/cử chỉ kéo xuống. Không coi toàn bộ suite là kiểm thử backend không mock. Passkey local dùng `http://localhost:4173`, giữ hostname xuyên suốt; các origin loopback phải nằm trong CORS allowlist của backend.

## Giới hạn hiện tại và bước tiếp theo

- Ghi offline hiện tập trung vào thu/chi và tạo chuyển ví. Đăng nhập mới/quản trị và các thao tác gọi API trực tiếp cần mạng; cache app shell không bảo đảm mở lại phiên offline được trong mọi tình huống.
- Có phát hiện revision conflict và giữ dữ liệu local, chưa có UI giải quyết xung đột hoàn chỉnh. Báo cáo/server có thể chưa gồm thay đổi còn chờ gửi; Admin không thấy dữ liệu offline chưa sync của User.
- Đóng góp tiết kiệm không tự trừ ví. Lịch định kỳ không tự ghi thu/chi trước khi xác nhận.
- Scheduler hằng ngày hiện nhắc mở app; chưa đầy đủ nội dung tổng kết thu/chi và điều kiện nhắc khi chưa ghi giao dịch. Push/Passkey cần cấu hình, origin phù hợp và kiểm chứng iPhone. Tunnel tới local không chứng minh Workers Cron đang tự chạy.
- Backup/restore Google Drive mã hóa, OCR và PDF chưa hoàn chỉnh. Trang “Sao lưu và đồng bộ” hiện chủ yếu là sync; sync không thay thế backup. Phương án Drive là một tài khoản do Super Admin sở hữu, dữ liệu tách theo User.
- Apple ID, phục hồi truy cập và bootstrap production còn hạng mục chưa hoàn thiện. Không có tự đồng bộ ngân hàng hoặc chia sẻ sổ thu chi giữa User trong bản đầu.
- Có cấu hình CI/preview/rollback, chưa có bằng chứng đủ để xác nhận production và toàn bộ UAT đã đạt. Database ID/cấu hình tồn tại không chứng minh tài nguyên đang hoạt động.

Ưu tiên còn lại: môi trường/tài liệu → nghiệm thu nghiệp vụ → offline/xung đột → backup/restore → thông báo/Passkey → OCR/PDF → nghiệm thu phát hành. Theo dõi chi tiết ở [N00–N07](docs/implementation-phases.md).

## Môi trường đã kiểm chứng theo README

Ngày 04/11/2026 đã làm lại các bước cài đặt/khởi chạy dưới đây, không chỉ kiểm tra nội dung câu lệnh:

| Môi trường/chức năng | Kết quả | Phạm vi và giới hạn |
|---|---|---|
| Windows native x64 | Đạt trên Node 24.21.0, npm 11.19.0 | `npm ci`, workspace links, `runtime:check`, migration dev và `npm run dev`; cổng 5173/8787 |
| Giao diện Windows native | Đạt bằng Edge headless | Form đăng nhập mới không báo lỗi cookie; bấm nút ở `/setup` gọi API health thành công, database `ok`. Không thử lại tài khoản Admin trong database native |
| Docker Desktop Linux containers | Đạt, Node trong image 24.22.2 | Build hai image, dừng rồi chạy lại bằng lệnh `docker compose up -d --build --wait --wait-timeout 180 frontend backend`; hai service healthy |
| Giao diện Docker | Đạt bằng Edge headless | `/setup` kết nối D1, Admin đăng nhập tới dashboard, `/auth/me` hợp lệ và đăng xuất phiên kiểm tra |
| Dữ liệu sau chạy lại Docker | Kiểm tra số lượng đạt | User/giao dịch vẫn là 1/0, schema 12 trước và sau; không phải bài thử khôi phục backup hoặc đối chiếu mọi bản ghi |
| Cloudflare Quick Tunnel | Health đạt sau khôi phục Docker | Dùng tiến trình tunnel hiện có; không kiểm thử tạo tunnel mới trong lượt này |
| Native preview/PWA | Chưa chạy lại preview native trong lượt này | Frontend build đã đạt; preview được chạy thực trong Docker. Chưa nghiệm thu offline/Passkey/Push trên iPhone |
| Playwright Chromium/WebKit | Đã cài browser binaries và chạy suite ngày 04/11/2026 | 50 đạt, 2 bài WebKit bỏ qua theo thiết kế; HTML/JSON và ảnh dashboard/kéo xuống đã lưu. Có các fixture auth UI như mô tả ở mục E2E; không thay thế iPhone thật |
| Safari/PWA iPhone, macOS, Linux native, Windows ARM hoặc Node khác | Chưa kiểm chứng | Không kết luận không hỗ trợ; chỉ Windows x64/Node 24 và Docker Linux được kiểm tra ở đây |
| Production, CI và rollback cloud | Chưa nghiệm thu | Local/tunnel hoạt động không thay thế kiểm tra cloud |

`npm ci` thành công nhưng npm audit báo **28 vấn đề dependency** (3 low, 22 moderate, 1 high, 2 critical) tại thời điểm này. npm cũng cảnh báo script cài đặt của esbuild/workerd chưa nằm trong allowScripts; runtime và Vite dev hiện vẫn chạy được. Chưa thay phiên bản hoặc tự chạy `npm audit fix --force`; cần rà soát riêng và chạy lại kiểm thử sau khi xử lý dependencies.

Sau kiểm tra đã dừng native và để Docker/tunnel hoạt động trở lại. Không tạo lại tài khoản hoặc xóa dữ liệu để nghiệm thu README; luồng bootstrap database trống chưa được chạy lại trong lượt này.

## Tài liệu liên quan

- [Luồng nghiệp vụ](AGENTS.md).
- [Kế hoạch và checklist hiện hành](docs/implementation-phases.md).
- [Yêu cầu và các quyết định nghiệp vụ](docs/quan-ly-thu-chi-requirements.md).
- [Đặc tả dự án](docs/quan-ly-thu-chi-project-specification.md).
- [Thiết kế hệ thống](docs/quan-ly-thu-chi-system-design.md).
- [Báo cáo P10](docs/P10-report.md).
- [Biên bản nghiệm thu P00/CI/preview](docs/p00-acceptance.md) — có mục lịch sử chưa được cập nhật theo các phase sau.
- [Hướng dẫn Cloudflare production](docs/cloudflare-production-deployment.md) — kiểm tra cấu hình, quyền và quy trình trước mọi thao tác remote.
