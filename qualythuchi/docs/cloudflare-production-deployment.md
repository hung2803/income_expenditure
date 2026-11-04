# Hướng dẫn deploy production lên Cloudflare — Quản lý thu chi

Ngày soạn: 30/10/2026. Hướng dẫn dành cho Windows PowerShell và mã nguồn hiện tại của dự án.

Tài liệu này hướng dẫn tạo tài nguyên và deploy; việc tạo file hướng dẫn chưa tạo tài khoản, database hoặc deployment nào trên Cloudflare.

## 1. Kiến trúc sẽ triển khai

Sử dụng **Cloudflare Workers Static Assets + Workers API + D1**. Frontend và backend được build riêng nhưng phát hành cùng một Worker production:

```text
iPhone / trình duyệt
        |
        | HTTPS: https://thu-chi-api-prod.<account-subdomain>.workers.dev
        | hoặc https://thuchi.tenmiencuaban.com
        v
Cloudflare Worker: thu-chi-api-prod
        |
        +-- /, /login, /dashboard, /assets/* ... -> frontend React đã build
        +-- /api, /api/*, /auth, /auth/*        -> backend Hono
        +-- Cron mỗi 15 phút                  -> scheduler thông báo
        |
        +-- binding DB -> D1: thu-chi-prod
```

Cloudflare hỗ trợ upload mã Worker và static assets trong cùng một deployment. SPA fallback cho phép mở trực tiếp các route React; `run_worker_first` dành các đường dẫn API cho backend. [Static Assets](https://developers.cloudflare.com/workers/static-assets/), [SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/).

Với cách này:

- Frontend dùng URL tương đối để gọi API; `VITE_API_BASE_URL` để trống.
- Cookie phiên đăng nhập, Passkey và PWA hoạt động trên cùng origin HTTPS.
- Không cần tạo thêm Cloudflare Pages hoặc VPS, Docker trên server, MySQL hay PostgreSQL.
- D1 production độc lập với D1 local/dev/test. Migration chỉ tạo schema, không tự chuyển dữ liệu local lên cloud.

Mô hình này kế thừa cấu hình static assets đã có trong `apps/backend/wrangler.preview.json`, nhưng dùng **`env.prod` trong `apps/backend/wrangler.jsonc`** để phù hợp các script production hiện có. Không dùng script preview để deploy production.

## 2. Những thông tin cần chuẩn bị

| Thông tin | Giá trị dùng trong tài liệu | Bạn cần làm |
|---|---|---|
| Cloudflare Account ID | `<ACCOUNT_ID>` | Copy từ tài khoản Cloudflare của bạn |
| Workers subdomain | `<account-subdomain>` | Chọn/xem trong Workers & Pages |
| Worker production | `thu-chi-api-prod` | Giữ tên này theo cấu hình hiện tại |
| D1 production | `thu-chi-prod` | Tạo mới trong đúng Cloudflare account |
| Database ID | `<D1_PRODUCTION_DATABASE_ID>` | Copy UUID thật sau khi tạo D1 |
| Origin ban đầu | `https://thu-chi-api-prod.<account-subdomain>.workers.dev` | Thay subdomain bằng giá trị thật |
| Tên miền riêng, tùy chọn | `https://thuchi.tenmiencuaban.com` | Dùng tên miền bạn sở hữu |
| Email quản trị push | `mailto:email-that-cua-ban@example.com` | Thay bằng địa chỉ liên hệ thật |

Không giữ nguyên các chuỗi trong dấu `<...>` khi chạy lệnh hoặc lưu cấu hình.

### 2.1. Lấy `ACCOUNT_ID` ở đâu?

**Cách 1 — Dashboard:**

1. Mở [dash.cloudflare.com](https://dash.cloudflare.com/) và đăng nhập.
2. Chọn account sẽ chứa ứng dụng.
3. Vào **Workers & Pages**.
4. Tìm **Account Details**, trường **Account ID**, bấm nút copy cạnh giá trị.

**Cách 2 — Tìm nhanh:** trong dashboard, nhấn **Ctrl+K**, nhập **Copy account ID** rồi chọn kết quả. Xem [hướng dẫn tìm Account ID của Cloudflare](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/).

**Cách 3 — CLI:** sau khi đăng nhập Wrangler ở bước 5:

```powershell
npx.cmd wrangler whoami
```

Đọc cột **Account ID** ở dòng account bạn chọn. Nếu có nhiều dòng, đối chiếu **Account Name** trước khi copy.

Ví dụ minh họa, không phải ID dùng thật:

```text
Account Name       Account ID
Tai khoan Thu Chi  a1b2c3d4e5f678901234567890abcdef
```

Chép giá trị lấy được vào **`apps/backend/wrangler.jsonc` → thuộc tính `account_id` cấp gốc**. Ví dụ cách điền:

```json
"account_id": "a1b2c3d4e5f678901234567890abcdef"
```

Account ID thường gồm 32 ký tự hex, không có dấu `-`. Nó không phải email đăng nhập, Account Name, Zone ID, API token hay Database ID. Nếu dashboard và `whoami` cho kết quả khác nhau, kiểm tra lại account trước khi deploy.

### 2.2. Lấy `<account-subdomain>` và URL frontend/backend ở đâu?

1. Trong dashboard đúng account, mở **Workers & Pages**.
2. Tìm **Your subdomain**; giá trị có dạng `ten-ban-chon.workers.dev`.
3. Nếu chưa thiết lập, làm theo yêu cầu đăng ký Workers subdomain. Để đổi giá trị đã có, chọn **Change** cạnh **Your subdomain**; không đổi nếu các Worker đang dùng hostname đó cần giữ nguyên.
4. Ví dụ dashboard hiển thị `sotayminh.workers.dev` thì phần cần thay cho `<account-subdomain>` là **`sotayminh`**, không chép thêm `.workers.dev` lần thứ hai.

Cấu trúc hostname do Worker name và account subdomain tạo thành. Xem [cấu hình workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

Trong dự án này, Worker name là `thu-chi-api-prod`, nên ví dụ trên cho origin:

```text
https://thu-chi-api-prod.sotayminh.workers.dev
```

Điền cùng origin đó vào các chỗ sau:

| Chỗ cần điền | Giá trị theo ví dụ |
|---|---|
| `apps/backend/wrangler.jsonc` → `env.prod.vars.CORS_ORIGINS` | `https://thu-chi-api-prod.sotayminh.workers.dev` |
| Biến PowerShell `$productionOrigin` ở bước 10 | `https://thu-chi-api-prod.sotayminh.workers.dev` |
| URL kiểm tra đăng nhập | `https://thu-chi-api-prod.sotayminh.workers.dev/login` |
| URL kiểm tra DB/API | `https://thu-chi-api-prod.sotayminh.workers.dev/api/health` |

**Sau lần deploy đầu tiên:** mở **Workers & Pages → thu-chi-api-prod → Settings → Domains & Routes**, copy URL `workers.dev` đang bật để đối chiếu. URL Wrangler in khi deploy cũng là nơi xác nhận hostname thực tế.

Frontend và backend chung một origin theo kiến trúc tài liệu này. Không cần tìm hai URL riêng. `CORS_ORIGINS` không chứa `/login`, `/api/health` hoặc dấu `/` cuối.

### 2.3. Lấy `D1_PRODUCTION_DATABASE_ID` ở đâu?

Thông số này chỉ có **sau khi tạo D1 ở bước 6**. Trước khi tạo database, bạn chưa thể điền ID thật.

**Từ CLI — cách dễ đối chiếu nhất:**

```powershell
npx.cmd wrangler d1 list
```

Tìm dòng có **name = `thu-chi-prod`**. Copy giá trị cột **uuid** của đúng dòng đó. Nếu chưa có dòng này, kiểm tra account hoặc tạo D1 ở bước 6.

Ngay sau `wrangler d1 create thu-chi-prod`, output cũng có `database_id`; đây là cùng loại giá trị cần dùng. Xem [tạo và binding D1](https://developers.cloudflare.com/d1/get-started/).

**Từ dashboard:** mở **Storage & databases → D1 → thu-chi-prod**, tìm **Database ID** trong trang thông tin database/Settings. Nếu bố cục dashboard không hiện trường này, dùng `wrangler d1 list` ở trên, không lấy Account ID thay thế.

Ví dụ giả để nhận dạng:

```text
uuid                                  name
12345678-90ab-4cde-8f01-234567890abc  thu-chi-prod
```

Điền vào **`apps/backend/wrangler.jsonc` → `env.prod.d1_databases[0].database_id`**:

```json
"database_id": "12345678-90ab-4cde-8f01-234567890abc"
```

UUID này có dấu `-`; không dùng ID mẫu bắt đầu `00000000-`. Giữ `database_name` là `thu-chi-prod` và `binding` là `DB`. Ba giá trị khác nhau, không chép UUID vào cả ba trường.

Sau khi cấu hình, có thể xác nhận database đích:

```powershell
Push-Location apps/backend
npx.cmd wrangler d1 info DB --env prod
Pop-Location
```

Lệnh này đọc thông tin database; đối chiếu tên và UUID với D1 vừa tạo.

### 2.4. Các giá trị nào tự chọn, giá trị nào giữ nguyên?

Đây là bảng tra cho **toàn bộ cấu hình production ở bước 7**. Ngoài Account ID, D1 ID và origin, các giá trị còn lại đã có lựa chọn cụ thể cho dự án:

| Thuộc tính | Lấy ở đâu / ai quyết định? | Điền gì cho dự án này? |
|---|---|---|
| `account_id` | Cloudflare cấp; lấy theo mục 2.1 | Account ID thật |
| `env.prod.name` | Tên tài nguyên do mình chọn; dự án đã đặt sẵn | `thu-chi-api-prod` |
| `workers_dev` | Công tắc cấu hình, không phải thông số cần xin | `true` khi dùng URL Workers ban đầu |
| `preview_urls` | Công tắc cấu hình | `false` |
| `vars.APP_ENV` | Quy ước backend của dự án | `prod`, không ghi `production` |
| `vars.CORS_ORIGINS` | Origin ứng dụng ghép ở mục 2.2 hoặc domain của bạn | Origin HTTPS thật |
| `version_metadata.binding` | Tên binding được `Env`/middleware dự án đọc | `WORKER_VERSION` |
| `assets.directory` | Thư mục build frontend tương đối từ `apps/backend` | `../frontend/dist` |
| `assets.not_found_handling` | Cấu hình router SPA | `single-page-application` |
| `assets.run_worker_first` | Các prefix API của mã nguồn | Giữ nguyên mảng ở bước 7 |
| `d1_databases[0].binding` | Tên backend truy cập bằng `env.DB` | `DB` |
| `d1_databases[0].database_name` | Tên bạn nhập khi tạo D1 | `thu-chi-prod` |
| `d1_databases[0].database_id` | Cloudflare cấp sau khi tạo D1 | UUID thật theo mục 2.3 |
| `d1_databases[0].migrations_dir` | Thư mục SQL sẵn có trong backend | `migrations` |
| `triggers.crons` | Lịch đánh thức scheduler của dự án | `["*/15 * * * *"]` |
| `observability.enabled` | Công tắc log/quan sát Worker | `true` |
| `main` ở cấp gốc | File entry backend đã có trong repo | Giữ `src/index.ts` |
| `compatibility_date` ở cấp gốc | Mốc tương thích runtime của dự án | Giữ `2026-10-22` trong cấu hình hiện tại |
| `compatibility_flags` ở cấp gốc | Tùy chọn cho các API Node mà backend dùng | Giữ `["nodejs_compat"]` |
| `VITE_API_BASE_URL` | Cấu hình build frontend cho mô hình chung origin | Để trống; không lấy Account ID/DB ID điền vào đây |

Ví dụ để kiểm tra tính nhất quán: nếu giữ Worker name `thu-chi-api-prod`, account subdomain `sotayminh` thì origin phải là `https://thu-chi-api-prod.sotayminh.workers.dev`. Nếu đổi Worker name, cần tính lại origin và kiểm tra các script liên quan.

### 2.5. Lấy khóa Push và email `VAPID_SUBJECT` ở đâu?

Các khóa này **không copy từ trang Account ID, D1, Apple Developer hoặc Firebase**. Script đã có trong repository sinh chúng tại bước 12.

| Thông số | Nguồn giá trị | Nơi dùng |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Script `generate-notification-keys.mjs` tự sinh | Runtime backend; API trả public key cho trình duyệt |
| `VAPID_PRIVATE_KEY` | Cùng lần sinh với public key | Secret của Worker production |
| `SUBSCRIPTION_ENCRYPTION_KEY` | Script tự sinh khóa ngẫu nhiên 32 byte | Secret để mã hóa subscription trong DB |
| `VAPID_SUBJECT` | Bạn nhập email liên hệ thật | Dạng `mailto:email-cua-ban` trong bộ secrets |

Ví dụ: bạn dùng email `quantri@congtycuaban.vn` thì giá trị là `mailto:quantri@congtycuaban.vn`. Không cần tạo email trong Cloudflare để có thông số này; dùng địa chỉ liên hệ bạn quản lý.

Đoạn PowerShell ở bước 12 lưu kết quả sinh vào file `apps/backend/.wrangler/production-notification-secrets.json`. Không cần copy thủ công từng private key vào Markdown hay frontend; lệnh `secret bulk` upload trực tiếp file đó vào đúng Worker.

Sau upload, kiểm tra **Workers & Pages → thu-chi-api-prod → Settings → Variables and Secrets** để thấy tên biến đã lưu. Secret value không dùng trang này để đọc lại; cần giữ bộ khóa gốc trong nơi quản lý bí mật của bạn. Xem [quản lý secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

### 2.6. Lấy tên miền, `pattern` và thông tin DNS ở đâu?

- **`thuchi.tenmiencuaban.com` là ví dụ**, không phải tên miền Cloudflare tự cấp. Nếu chưa sở hữu domain, có thể bỏ bước domain riêng và dùng URL Workers ban đầu để thiết lập/kiểm tra.
- Nếu đã sở hữu `congtycuaban.vn`, bạn có thể chọn subdomain `thuchi.congtycuaban.vn`. Phần `thuchi` do bạn đặt; không cần mua riêng subdomain.
- Trong `routes[].pattern`, điền **hostname** `thuchi.congtycuaban.vn`, không thêm `https://`, `/` hoặc `/*` khi dùng `custom_domain: true`.
- Trong `CORS_ORIGINS`, điền **origin** `https://thuchi.congtycuaban.vn`, có `https://`.
- Nameserver: mở domain trong Cloudflare, xem phần thiết lập DNS/nameserver; copy đúng cặp được cấp cho domain của bạn rồi dán vào mục Nameservers tại **nhà đăng ký domain**. Không lấy nameserver từ ví dụ của người khác.

Nếu bạn không biết nơi đăng ký domain, kiểm tra tài khoản/hóa đơn nơi mua tên miền. Việc copy nameserver phải làm tại nơi quản lý đăng ký tên miền, không phải trong `wrangler.jsonc`.

Để gắn hostname, dùng **Worker → Settings → Domains & Routes → Add → Custom Domain** hoặc cấu hình bước 13. Xem [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

### 2.7. Các thông số chỉ xuất hiện sau khi deploy

| Thông số trong hướng dẫn | Khi nào có? | Cách lấy |
|---|---|---|
| `WORKER_VERSION` | Khi Worker chạy có version metadata binding | Cloudflare cung cấp object runtime; không tự nhập UUID vào cấu hình binding |
| `<PREVIOUS_VERSION_ID>` | Sau khi đã có phiên bản deploy trước đó | Output deploy hoặc `wrangler versions list --env prod` từ thư mục backend; xem mục 16.2 |
| `<BOOKMARK_DA_XAC_MINH>` | Khi D1 cloud có mốc Time Travel | Output `wrangler d1 time-travel info DB --env prod`; xem mục 17.2 |
| `schema_version = 12` | Sau khi áp dụng migration hiện có | Kết quả SQL ở bước 8, không phải biến cần điền tay |
| CSRF token/session cookie | Sau khi người dùng đăng nhập | Ứng dụng xử lý; không tạo thủ công trong dashboard |
| Passkey RP ID | Khi thao tác Passkey trên hostname chính thức | Backend lấy hostname từ origin; không có biến `RP_ID` riêng cần copy trong phiên bản này |

### 2.8. Phiếu ghi thông số trước khi sửa cấu hình

Copy mẫu này vào ghi chú riêng và thay bằng thông tin thật. Mẫu này không cần chứa private key/token/mật khẩu:

```text
Tên account Cloudflare:
Account ID:
Workers subdomain, chỉ phần trước .workers.dev:
Worker name: thu-chi-api-prod
D1 name: thu-chi-prod
D1 UUID, sau khi tạo DB:
Origin Workers đầy đủ, có https://:
Domain riêng, nếu có:
Origin domain riêng, nếu có:
Email liên hệ Push:
```

Ở lượt deploy thủ công đầu tiên, chỉ cần Account ID, Workers subdomain, D1 UUID và các tên đã chọn. `CLOUDFLARE_API_TOKEN` chỉ cần khi chuyển sang tự động hóa; mục 18 có hướng dẫn tạo riêng.

Tất cả lệnh dưới đây chạy ở **thư mục gốc dự án**, trừ các khối ghi rõ `Push-Location apps/backend`. Chạy lần lượt; nếu một lệnh báo lỗi hoặc `$LASTEXITCODE` khác `0`, xử lý trước khi chuyển bước. PowerShell không mặc định dừng toàn bộ các lệnh tiếp theo khi một chương trình ngoài báo lỗi.

## 3. Tạo tài khoản Cloudflare và chọn gói

1. Vào [Cloudflare Dashboard](https://dash.cloudflare.com/), đăng ký hoặc đăng nhập.
2. Xác minh email và bật xác thực hai bước cho tài khoản quản trị.
3. Chọn đúng account nếu tài khoản của bạn thuộc nhiều tổ chức.
4. Mở **Workers & Pages**. Nếu được yêu cầu, thiết lập Workers subdomain. Ghi lại phần subdomain của account.
5. Lấy **Account ID** theo mục **2.1**: Workers & Pages → Account Details → Account ID → copy; hoặc Ctrl+K → Copy account ID. Có thể đối chiếu bằng `wrangler whoami` ở bước sau.
6. Kiểm tra gói Workers đang dùng trong phần billing/subscription của account.

Workers Free hiện có giới hạn CPU 10 ms cho một HTTP request. Backend của dự án dùng `scrypt` với `N=16384, r=8, p=5` để kiểm tra mật khẩu; đây là tác vụ cần CPU. **Suy luận từ cấu hình mã nguồn:** cần đo đăng nhập thực tế, không thể dùng kết quả health API để kết luận gói Free đủ chạy auth. Nếu vượt CPU, chọn Workers Paid và kiểm tra lại. Không giảm độ mạnh hash chỉ để né giới hạn. Xem [giới hạn Workers](https://developers.cloudflare.com/workers/platform/limits/).

Gói website/zone và gói Workers là những lựa chọn dịch vụ khác nhau. Kiểm tra giá và quota tại thời điểm đăng ký; tài liệu này không cam kết chi phí bằng 0. Xem [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) và [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## 4. Chuẩn bị máy và kiểm tra dự án

### 4.1. Node và dependencies

Dự án yêu cầu Node.js từ 22.12; nên dùng Node.js 24 như môi trường đang kiểm tra dự án.

```powershell
Set-Location C:\Users\User\Documents\qualythuchi
node --version
npm.cmd --version
npm.cmd ci
```

Đã có `package-lock.json`, do đó dùng `npm ci`. Nếu cập nhật dependencies có chủ đích, cập nhật lockfile trong quy trình phát triển trước khi deploy.

### 4.2. Kiểm tra chất lượng

```powershell
npm.cmd run check
```

Lệnh này gồm lint, typecheck, test và build. Build backend trong lệnh này dùng `--dry-run`, không deploy cloud.

Kiểm thử trình duyệt:

```powershell
npx.cmd playwright install chromium webkit
npm.cmd run test:e2e
```

Nếu test runtime bị môi trường máy chặn, ghi rõ phần chưa chạy và kiểm tra lại trên máy/CI có đủ quyền. Không coi việc có file test là bằng chứng test đã đạt.

## 5. Đăng nhập Cloudflare CLI

```powershell
npx.cmd wrangler login
npx.cmd wrangler whoami
```

Trình duyệt mở trang cấp quyền: đăng nhập đúng account và chấp nhận quyền Wrangler cần để quản lý Workers/D1.

Nếu dùng nhiều account, ghi `account_id` tường minh trong cấu hình ở bước 7. Không dùng Global API Key cho hướng dẫn này. Lần deploy thủ công đầu tiên dùng OAuth login; chưa cần tạo API token cho CI.

Nếu dashboard chưa hiển thị Workers subdomain, hoàn tất thiết lập Workers & Pages trước khi chọn origin production. Tên miền cuối sẽ có dạng `thu-chi-api-prod.<account-subdomain>.workers.dev`.

## 6. Tạo D1 production

Chỉ tạo database **một lần**. Có thể chọn một trong hai cách:

### Cách A — Tạo bằng dashboard

1. Trong đúng account, mở **Storage & databases → D1**; tên nhóm menu có thể thay đổi theo dashboard.
2. Chọn **Create database**.
3. Nhập tên `thu-chi-prod`, hoàn tất tạo database.
4. Mở database vừa tạo, tìm **Database ID** trong thông tin/Settings và copy. Nếu không thấy trường, chạy `npx.cmd wrangler d1 list`, lấy cột **uuid** của dòng **thu-chi-prod** như mục 2.3.
5. Database mới đang trống; chưa cần tự tạo bảng trong SQL console.

### Cách B — Tạo bằng Wrangler

```powershell
npx.cmd wrangler d1 create thu-chi-prod
npx.cmd wrangler d1 list
```

Lệnh tạo sẽ trả về thông tin database, bao gồm `database_id`. Nếu Wrangler hỏi tự sửa cấu hình, có thể chọn không và cập nhật thủ công đúng `env.prod` ở bước 7. Không tạo database lần nữa nếu đã tạo bằng dashboard.

Binding backend bắt buộc tên **`DB`**, vì mã nguồn đọc `env.DB`. Tên database cloud là `thu-chi-prod`; hai tên này có vai trò khác nhau. Xem [các lệnh D1](https://developers.cloudflare.com/d1/wrangler-commands/).

## 7. Cấu hình backend, frontend assets và DB production

Mở **`apps/backend/wrangler.jsonc`**.

### 7.1. Ghi account ID ở cấp gốc

Thêm thuộc tính sau ở cùng cấp với `name`, `main`, `env`:

`<ACCOUNT_ID>` lấy ở **mục 2.1**, không phải Database ID. Mở file bằng editor, thêm dòng sau ngay dưới dòng `$schema` và giữ dấu phẩy phân cách với các thuộc tính khác:

```json
"account_id": "<ACCOUNT_ID>"
```

Nhớ thêm dấu phẩy đúng cú pháp. Dù tên file là `.jsonc`, script `cloud.mjs` hiện đọc bằng `JSON.parse`; **giữ file là JSON hợp lệ, không thêm comment hoặc dấu phẩy thừa**.

### 7.2. Thay riêng khối `env.prod`

Giữ nguyên khối gốc, `env.dev` và `env.test`. Thay toàn bộ đối tượng `prod` hiện có bằng mẫu sau sau khi điền ID và subdomain thật:

```json
"prod": {
  "name": "thu-chi-api-prod",
  "workers_dev": true,
  "preview_urls": false,
  "vars": {
    "APP_ENV": "prod",
    "CORS_ORIGINS": "https://thu-chi-api-prod.<account-subdomain>.workers.dev"
  },
  "version_metadata": {
    "binding": "WORKER_VERSION"
  },
  "assets": {
    "directory": "../frontend/dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api", "/api/*", "/auth", "/auth/*"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "thu-chi-prod",
      "database_id": "<D1_PRODUCTION_DATABASE_ID>",
      "migrations_dir": "migrations"
    }
  ],
  "triggers": {
    "crons": ["*/15 * * * *"]
  },
  "observability": {
    "enabled": true
  }
}
```

Giải thích:

- `workers_dev: true` trong `prod` bật URL public; giá trị ở cấp gốc hiện là `false` nên cần ghi đè.
- `preview_urls: false` tắt URL preview phiên bản cho Worker production.
- Đường dẫn assets và migrations tính từ thư mục chứa file Wrangler, tức `apps/backend`.
- Không cần sửa `Env` để thêm assets binding: cấu hình này để Cloudflare tự phục vụ static assets, không gọi `env.ASSETS` trong backend.
- Phải chuyển **cả `/auth` và `/api`** vào Worker. Nếu thiếu `/auth/*`, đăng nhập có thể nhận HTML thay JSON.
- `CORS_ORIGINS` chứa origin HTTPS chính xác, không có `/api`, không thêm dấu `/` cuối, không dùng `*`.
- Cron chạy mỗi 15 phút; scheduler trong mã nguồn quyết định có gửi theo timezone tài khoản hay không. Không đổi cron thành 21:00 UTC để thay cho giờ địa phương.
- D1 ID production không được trùng dev/test; script kiểm tra đã có ràng buộc này.

Tùy chọn assets và routing được mô tả tại [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) và [điều khiển Worker routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).

### 7.3. Kiểm tra cấu hình bằng script dự án

```powershell
npm.cmd run cloud:check --workspace @thu-chi/backend -- prod
```

Kết quả phải xác nhận:

```text
Target: prod; Worker: thu-chi-api-prod; D1: thu-chi-prod
Configuration is ready for Cloudflare commands; no remote resource was changed.
```

Đây là kiểm tra cấu hình local; chưa xác nhận ID database có tồn tại hay account có quyền. Các lệnh remote ở bước tiếp theo sẽ kiểm tra quyền thực tế.

## 8. Áp dụng migration lên D1 cloud

**Đây là bước thay đổi database production thật.** Database lần đầu phải là database mới dành riêng cho ứng dụng.

```powershell
npm.cmd run cloud:migrate --workspace @thu-chi/backend -- prod
```

Script dự án sẽ gọi `wrangler d1 migrations apply DB --remote --env prod`. Đọc bảng migration và xác nhận khi Wrangler hỏi.

Kiểm tra:

```powershell
Push-Location apps/backend
npx.cmd wrangler d1 migrations list DB --remote --env prod
npx.cmd wrangler d1 execute DB --remote --env prod --command "SELECT value FROM app_metadata WHERE key='schema_version';"
npx.cmd wrangler d1 execute DB --remote --env prod --command "SELECT COUNT(*) AS users_count FROM users;"
Pop-Location
```

Ở phiên bản hiện tại: schema phải là **`12`**, không còn migration chưa áp dụng, `users_count` của database mới là `0`.

Không dùng `npm run db:migrate:local` cho bước này: lệnh đó chỉ thay đổi database trên máy. Không tự nhập SQL của migration lần thứ hai nếu Wrangler đã quản lý nó trong bảng migration.

## 9. Build frontend cho production

Ở thư mục gốc:

```powershell
$env:VITE_API_BASE_URL = ''
npm.cmd run build --workspace @thu-chi/frontend
```

Sau khi build, kiểm tra:

```powershell
Test-Path apps/frontend/dist/index.html
Test-Path apps/frontend/dist/sw.js
Test-Path apps/frontend/dist/manifest.webmanifest
Test-Path apps/frontend/dist/push-sw.js
```

Cả bốn phải trả `True`. Frontend được đóng gói từ `apps/frontend/dist`; không upload thư mục `src` làm static website.

`VITE_API_BASE_URL` là cấu hình **lúc build**. Giữ trống để frontend gọi `/api/...` và `/auth/...` trên chính hostname của ứng dụng. Vite proxy chỉ phục vụ dev/preview trên máy; production sử dụng Workers routing đã cấu hình ở bước 7.

Không đặt token Cloudflare, khóa mã hóa, VAPID private key hoặc mật khẩu vào bất kỳ biến `VITE_*` nào; các biến này có thể xuất hiện trong JavaScript gửi tới trình duyệt.

## 10. Kiểm tra bundle và deploy lần đầu

Kiểm tra bundle production với cấu hình đã sửa:

```powershell
npm.cmd run build:prod --workspace @thu-chi/backend
```

Lệnh này là `wrangler deploy --dry-run --env prod`; chưa phát hành. Kiểm tra thông tin DB, assets và Worker trong output, sau đó deploy:

```powershell
npm.cmd run cloud:deploy --workspace @thu-chi/backend -- prod
```

Wrangler tạo/cập nhật Worker `thu-chi-api-prod`, upload frontend đã build, gắn D1 và Cron. Không cần bấm tạo thêm Worker mẫu trong dashboard trước.

Lưu lại URL và **Version ID** được trả về. Mở:

```text
https://thu-chi-api-prod.<account-subdomain>.workers.dev/login
https://thu-chi-api-prod.<account-subdomain>.workers.dev/api/health
```

Health mong đợi:

```json
{
  "status": "ok",
  "service": "thu-chi-api",
  "environment": "prod",
  "checks": { "database": "ok" }
}
```

Kiểm tra bằng PowerShell, thay subdomain trước khi chạy:

```powershell
$productionOrigin = 'https://thu-chi-api-prod.<account-subdomain>.workers.dev'
Invoke-RestMethod -Uri "$productionOrigin/api/health"
$healthResponse = Invoke-WebRequest -Uri "$productionOrigin/api/health" -UseBasicParsing
$healthResponse.StatusCode
$healthResponse.Headers['Cache-Control']
$healthResponse.Headers['X-Worker-Version']
```

Kỳ vọng HTTP `200`, `Cache-Control: no-store`, có version header. Health kiểm tra schema DB; chưa chứng minh đăng nhập, push và mọi nghiệp vụ đã hoạt động.

Nếu chưa cấu hình push ở bước 12 thì chức năng push chưa dùng được; vẫn có thể triển khai và kiểm tra các luồng thu chi trước.

## 11. Tạo Super Admin đầu tiên cho production

### 11.1. Vì sao cần quy trình riêng?

`npm run auth:bootstrap` hiện **chỉ hỗ trợ `--local dev` hoặc `--local test`**. Gọi `--remote prod` với CLI hiện tại sẽ bị từ chối. Ứng dụng không có endpoint public tự tạo Super Admin.

Quy trình dưới đây tạo một bản sao CLI dành cho lần khởi tạo production, tái sử dụng bộ kiểm tra đầu vào và hash mật khẩu của dự án. SQL chỉ chèn khi cả `users` và `auth_bootstrap` đều trống; trigger ghi dấu đã bootstrap. Không sửa cơ chế hash hoặc tạo tài khoản mẫu có mật khẩu cố định.

Thực hiện trên terminal PowerShell tương tác của máy tin cậy. Tắt transcript/ghi hình terminal nếu đang bật. Script nhập mật khẩu ẩn, không truyền mật khẩu trên command line.

### 11.2. Tạo bản sao script

```powershell
Copy-Item -LiteralPath apps/backend/scripts/bootstrap.mjs -Destination apps/backend/scripts/bootstrap-production.mjs
```

Mở `apps/backend/scripts/bootstrap-production.mjs`, thực hiện đúng các chỉnh sửa sau.

**A.** Đổi import filesystem:

```javascript
import { mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
```

**B.** Thay import `bootstrapArgs, bootstrapSql` bằng:

```javascript
import { bootstrapSql } from './bootstrap-config.mjs';
import { validateCloudConfig } from './cloud-config.mjs';
```

**C.** Thay dòng:

```javascript
const args = bootstrapArgs(process.argv.slice(2));
```

bằng đoạn sau:

```javascript
if (process.argv.slice(2).join(' ') !== '--remote prod') {
  throw new Error('Use exactly --remote prod for this one-time production script.');
}
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const target = validateCloudConfig(config, 'prod');
console.log(`Target: prod; Worker: ${target.worker}; D1: ${target.database}`);
const args = ['d1', 'execute', 'DB', '--remote', '--env', 'prod', '--json', '--yes'];
```

**D.** Sửa hai thông báo cuối cho đúng môi trường: thay `selected local database` bằng `selected production database` trong thông báo thành công, và bỏ từ `local` trong thông báo database phải trống.

Giữ nguyên các phần còn lại: nhập mật khẩu ẩn, xác nhận mật khẩu, `hashPassword`, `bootstrapSql`, file SQL tạm, kiểm tra `RETURNING id` và `finally` xóa file tạm. `--yes` cho phép lệnh D1 trong helper không tương tác chạy file SQL sau khi bạn đã chọn đúng đích và nhập tài khoản; helper không chuyển tiếp stdin để trả lời prompt của Wrangler.

### 11.3. Kiểm tra và chạy một lần

```powershell
node --check apps/backend/scripts/bootstrap-production.mjs
node --experimental-strip-types apps/backend/scripts/bootstrap-production.mjs --remote prod
```

Nhập username, tên hiển thị, mật khẩu và xác nhận mật khẩu. Mật khẩu hiện được mã nguồn giới hạn **8–25 ký tự**; dùng mật khẩu riêng, lưu trong trình quản lý mật khẩu. Username gồm chữ, số, dấu chấm, `_`, `-` và được chuẩn hóa về chữ thường.

Chỉ chạy bước này sau khi đã xác minh `account_id`, D1 ID và migrations production. Script hiển thị tên đích trước khi nhập thông tin.

Kiểm tra kết quả mà không đọc password hash:

```powershell
Push-Location apps/backend
npx.cmd wrangler d1 execute DB --remote --env prod --command "SELECT id, username, display_name, role, is_active FROM users;"
npx.cmd wrangler d1 execute DB --remote --env prod --command "SELECT singleton, user_id FROM auth_bootstrap;"
Pop-Location
```

Kỳ vọng có một `SUPER_ADMIN` đang hoạt động và một bản ghi `auth_bootstrap`. Đăng nhập tại `/login`, sau đó tạo các tài khoản USER bằng trang quản trị.

Xóa bản sao CLI sau khi hoàn tất; chỉ xóa đúng file vừa tạo:

```powershell
Remove-Item -LiteralPath apps/backend/scripts/bootstrap-production.mjs
```

Không xóa bản ghi `auth_bootstrap` hoặc dữ liệu users để cố mở lại bootstrap. Nếu CLI báo “No Admin was created”, kiểm tra database có tài khoản trước đó không; không đổi SQL thành chèn vô điều kiện.

Lưu ý chẩn đoán: helper `runWranglerJson` hiện dùng thông báo lỗi có chữ “local database” ngay cả khi lệnh remote thất bại. Với bản sao này, kiểm tra OAuth/account ID/quyền D1/schema production; thông báo đó không có nghĩa script đã chuyển sang local.

## 12. Cấu hình Web Push production

### 12.1. Sinh bộ khóa riêng

Không tái sử dụng khóa local/test. Ở thư mục gốc, sinh JSON vào thư mục đã được `.gitignore` bỏ qua:

```powershell
New-Item -ItemType Directory -Force -Path apps/backend/.wrangler | Out-Null
$notificationJson = & node apps/backend/scripts/generate-notification-keys.mjs | Out-String
if ($LASTEXITCODE -ne 0) { throw 'Không sinh được khóa thông báo.' }
$notificationKeys = $notificationJson | ConvertFrom-Json
$notificationKeys.VAPID_SUBJECT = 'mailto:email-that-cua-ban@example.com'
$notificationSecretsFile = Join-Path (Get-Location) 'apps/backend/.wrangler/production-notification-secrets.json'
[System.IO.File]::WriteAllText($notificationSecretsFile, ($notificationKeys | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Remove-Variable notificationJson, notificationKeys
```

Thay email trước khi chạy. Không dùng `--write-local`: tùy chọn đó tạo khóa cho môi trường dev. Không chạy lại đoạn sinh khóa ở mỗi lần deploy.

### 12.2. Upload secrets

Lưu bộ khóa vào nơi quản lý bí mật phù hợp, sau đó:

```powershell
Push-Location apps/backend
npx.cmd wrangler secret bulk .wrangler/production-notification-secrets.json --env prod
npx.cmd wrangler secret list --env prod
Pop-Location
```

Upload bốn giá trị: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `SUBSCRIPTION_ENCRYPTION_KEY`, `VAPID_SUBJECT`. Hai giá trị public/subject cũng có thể lưu dạng vars, nhưng hướng dẫn này lưu cả bốn dưới dạng secrets để thao tác thống nhất. Endpoint push-key chỉ trả public key cho frontend.

Cloudflare secrets là biến runtime; không đưa bộ khóa vào frontend build. `wrangler secret bulk` nhận file JSON; khi cập nhật secrets cần kiểm tra deployment/version sau thao tác. Xem [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Sau khi đã lưu an toàn và upload thành công, xóa file tạm chứa khóa:

```powershell
Remove-Item -LiteralPath apps/backend/.wrangler/production-notification-secrets.json
```

Không đổi `SUBSCRIPTION_ENCRYPTION_KEY` tùy tiện: server dùng nó giải mã subscription đã lưu. Việc đổi VAPID key cũng cần kế hoạch đăng ký lại thiết bị.

### 12.3. Kiểm tra

1. Mở `/api/notifications/push-key`, xác nhận `publicKey` không trống.
2. Trong dashboard của Worker, kiểm tra Cron `*/15 * * * *`.
3. Trên iPhone, cài ứng dụng vào Home Screen, mở từ biểu tượng rồi bật push trong ứng dụng.
4. Kiểm tra timezone và lịch nhắc theo tài khoản; xem logs nếu không gửi được.
5. Đăng ký và đăng nhập Passkey trên hostname chính thức. Passkey không cần VAPID; hai tính năng có cơ chế riêng.

## 13. Gắn tên miền riêng, nếu có

Nên chọn hostname chính thức trước khi người dùng bắt đầu đăng ký Passkey và ghi dữ liệu offline. Đổi hostname làm thay đổi origin/IndexedDB và RP ID Passkey; dữ liệu chưa sync trên hostname cũ không tự xuất hiện ở hostname mới.

### 13.1. Đưa domain vào Cloudflare

1. Thêm domain bạn sở hữu vào account Cloudflare nếu chưa có.
2. Kiểm tra các DNS record hiện hữu, đặc biệt email và các dịch vụ đang dùng.
3. Nếu dùng full DNS setup, đổi nameserver tại nơi mua domain theo thông tin Cloudflare cung cấp.
4. Chờ zone có trạng thái Active.

### 13.2. Cấu hình custom domain bằng file

Trong `env.prod` thêm:

```json
"routes": [
  { "pattern": "thuchi.tenmiencuaban.com", "custom_domain": true }
]
```

Đổi `CORS_ORIGINS` để chứa hostname chính thức; trong giai đoạn chuyển tiếp có thể giữ cả hai origin:

```json
"CORS_ORIGINS": "https://thuchi.tenmiencuaban.com,https://thu-chi-api-prod.<account-subdomain>.workers.dev"
```

Chạy:

```powershell
npm.cmd run cloud:check --workspace @thu-chi/backend -- prod
npm.cmd run cloud:deploy --workspace @thu-chi/backend -- prod
```

Cloudflare yêu cầu zone đang Active và tạo DNS/certificate cho Custom Domain. Nếu hostname đã có CNAME xung đột, kiểm tra dịch vụ hiện hữu trước khi thay thế. Xem [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Có thể thêm từ dashboard tại **Worker → Settings → Domains & Routes → Add → Custom Domain**, nhưng vẫn nên ghi lại cấu hình `routes` trong file để lần deploy sau nhất quán.

Sau khi kiểm tra HTTPS, đăng nhập và Passkey trên domain mới, có thể đặt `workers_dev: false` và thu hẹp `CORS_ORIGINS` về domain chính thức rồi deploy lại. Việc bỏ origin khỏi CORS không tự vô hiệu hóa hostname public; `workers_dev: false` mới tắt hostname Workers tương ứng.

## 14. Nghiệm thu production

### Frontend và API

- [ ] `/login` mở qua HTTPS, không gọi tài nguyên từ `localhost`.
- [ ] Reload trực tiếp `/dashboard`, `/transactions`, `/reports`, `/savings` không bị 404 từ hosting.
- [ ] `/api/health` trả `200`, `environment=prod`, database `ok`.
- [ ] `/api/duong-dan-khong-ton-tai` trả JSON 404, không trả `index.html`.
- [ ] Truy cập `/auth/me` khi chưa đăng nhập trả lỗi xác thực JSON.
- [ ] Đăng nhập đúng thành công, sai mật khẩu thất bại; theo dõi CPU/errors lúc đăng nhập.
- [ ] Cookie `__Host-thu_chi_session` có `Secure`, `HttpOnly`, `SameSite=Lax`.
- [ ] USER không mở được API quản trị; không đọc dữ liệu USER khác.

### Nghiệp vụ

- [ ] Tạo ví, danh mục, giao dịch; số dư thay đổi đúng.
- [ ] Chuyển ví không tăng tổng thu/chi; thử xóa và hoàn tác giao dịch.
- [ ] Ngân sách, báo cáo, tìm kiếm đúng dữ liệu tài khoản.
- [ ] Tiết kiệm ghi nhận đóng góp; giao dịch định kỳ chỉ ghi sổ sau xác nhận.
- [ ] Admin tạo USER và quản lý đúng tài khoản đích; audit ghi nhận thao tác.

### iPhone, offline, bảo mật tài khoản

- [ ] Safari mở được trang; Add to Home Screen và icon đúng.
- [ ] Sau khi tải online, tắt mạng và kiểm tra các luồng offline được hỗ trợ.
- [ ] Có mạng trở lại: hàng đợi đồng bộ và không tạo giao dịch trùng.
- [ ] Đổi tài khoản không lộ dữ liệu người trước.
- [ ] Đăng ký/đăng nhập/thu hồi Passkey trên domain chính thức.
- [ ] Push hoạt động từ PWA và thu hồi quyền được xử lý đúng.
- [ ] Khi deploy bản mới, PWA hiện thông báo cập nhật, không tự reload form đang nhập.

Ghi lại ngày kiểm tra, URL, Version ID, thiết bị/iOS và kết quả. P08 hiện còn hạng mục nghiệm thu iPhone; thao tác deploy không tự đóng các hạng mục đó.

## 15. Logs và xử lý lỗi thường gặp

Mở dashboard Worker để xem Observability, errors và D1 metrics. Hoặc theo dõi realtime:

```powershell
Push-Location apps/backend
npx.cmd wrangler tail --env prod
Pop-Location
```

Không ghi mật khẩu, cookie session, token, private key hoặc toàn bộ dữ liệu tài chính vào logs.

| Hiện tượng | Kiểm tra và cách xử lý |
|---|---|
| Script báo D1 placeholder | Điền UUID thật trong `env.prod.d1_databases`, không chỉ sửa binding cấp gốc |
| `CORS_ORIGINS` rỗng/không hợp lệ | Điền chính xác origin HTTPS vào `env.prod.vars` |
| Không có URL public | Kiểm tra `env.prod.workers_dev: true` hoặc custom domain đã Active |
| Health `503 degraded` | Kiểm tra binding DB production, migrations remote và schema `12` |
| Login/API trả HTML, lỗi JSON có ký tự `<` | Kiểm tra `assets.run_worker_first` có `/api`, `/api/*`, `/auth`, `/auth/*` |
| Reload route React bị 404 | Kiểm tra SPA fallback và frontend `dist/index.html` |
| Frontend gọi `localhost` hoặc API cũ | Build lại với `VITE_API_BASE_URL` trống rồi deploy; kiểm tra env và bản PWA cũ |
| `403 ORIGIN_NOT_ALLOWED` | Đối chiếu origin thực của trình duyệt với `CORS_ORIGINS`, kiểm tra hostname sau chuyển domain |
| Ghi dữ liệu bị 403 nhưng đăng nhập được | Kiểm tra cookie phiên và `X-CSRF-Token`; không tắt CSRF để xử lý |
| `426 HTTPS_REQUIRED` | Dùng URL HTTPS; không dùng HTTP LAN cho production auth/Passkey |
| Đăng nhập lỗi tài nguyên/CPU | Xem Worker CPU/errors và gói Workers; health thành công chưa chứng minh scrypt đủ tài nguyên |
| CLI bootstrap từ chối `--remote` | CLI gốc chỉ hỗ trợ local; dùng quy trình tại bước 11 |
| Push key trống hoặc `NOTIFICATIONS_NOT_CONFIGURED` | Kiểm tra đủ bốn biến runtime/secrets trong Worker production |
| Không nhận push đúng lịch | Kiểm tra subscription, quyền PWA, timezone, Cron và logs; delivery có độ trễ |
| Passkey lỗi sau đổi domain | Đăng nhập mật khẩu ở hostname mới và đăng ký lại Passkey cho RP ID mới |
| Deploy báo assets directory không tồn tại | Build frontend trước; đường dẫn assets tính từ `apps/backend/wrangler.jsonc` |
| Wrangler `EPERM` khi ghi log trên máy | Phân biệt lỗi ghi log local với lỗi API remote; chạy terminal người dùng có quyền ghi profile và kiểm tra exit code, không mặc định deploy đã thành công |

## 16. Deploy các lần tiếp theo và rollback

### 16.1. Quy trình cập nhật

1. Lưu phiên bản mã nguồn phát hành và Version ID đang chạy.
2. Kiểm tra/test; export DB và lưu mốc khôi phục trước khi migration.
3. Build frontend mới, kiểm tra bundle production.
4. Chạy migration nếu có, ưu tiên thay đổi tương thích với bản đang chạy.
5. Deploy; kiểm tra health, đăng nhập và nghiệp vụ chính.

Các lệnh từ thư mục gốc:

```powershell
npm.cmd run check
$env:VITE_API_BASE_URL = ''
npm.cmd run build --workspace @thu-chi/frontend
npm.cmd run build:prod --workspace @thu-chi/backend
npm.cmd run cloud:check --workspace @thu-chi/backend -- prod
# Sau khi đã sao lưu DB theo bước 17 nếu có dữ liệu:
npm.cmd run cloud:migrate --workspace @thu-chi/backend -- prod
npm.cmd run cloud:deploy --workspace @thu-chi/backend -- prod
```

Không sinh lại VAPID/encryption key và không bootstrap Admin lại ở mỗi lần deploy. Secrets đã lưu trên Worker không cần upload lại nếu không thay đổi.

### 16.2. Rollback Worker

Xem phiên bản và deployment hiện có:

```powershell
Push-Location apps/backend
npx.cmd wrangler versions list --env prod
npx.cmd wrangler deployments list --env prod
Pop-Location
```

Chọn đúng Version ID trước đó của `thu-chi-api-prod`, kiểm tra schema còn tương thích rồi mới chạy:

**Cách lấy `<PREVIOUS_VERSION_ID>`:**

1. Sau khi chạy hai lệnh ở trên, xem các mục phiên bản với trường **Version ID** hoặc **ID**, thời điểm tạo và thông tin phiên bản.
2. Xác định bản đã chạy ổn trước lần cập nhật lỗi, dựa trên thời điểm và bản ghi phát hành bạn đã lưu. Không chỉ lấy dòng đầu danh sách: đó có thể là bản đang lỗi hoặc bản upload chưa từng chạy.
3. Đối chiếu với deployment trước đó trong `deployments list`. Cần **Version ID**, không phải Deployment ID.
4. Copy đầy đủ UUID vào vị trí `<PREVIOUS_VERSION_ID>`, bỏ cả dấu `<` và `>`.
5. Cũng có thể mở **Workers & Pages → thu-chi-api-prod → Deployments**, chọn deployment trước đó và xem thông tin version.

Version ID có hình thức UUID tương tự D1 ID nhưng thuộc tài nguyên khác; không lấy UUID database đưa vào lệnh rollback. Nếu mới deploy lần đầu và không có bản cũ, chưa có version trước đó để khôi phục. Xem [Versions & deployments](https://developers.cloudflare.com/workers/versions-and-deployments/).

```powershell
Push-Location apps/backend
npx.cmd wrangler rollback <PREVIOUS_VERSION_ID> --env prod
Pop-Location
```

Rollback khôi phục Worker/assets theo phiên bản, **không đảo ngược dữ liệu D1 hoặc migration**. Nếu schema đã đổi không tương thích, cần kế hoạch phục hồi DB riêng. Sau rollback vẫn kiểm tra health, auth và cập nhật PWA trên thiết bị. Tham khảo [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).

## 17. Sao lưu D1 và khôi phục dữ liệu

P11A backup/restore Google Drive mã hóa của ứng dụng **chưa triển khai**. Deploy Workers/D1 không tự tạo chức năng đó.

### 17.1. Export DB trước các thay đổi quan trọng

Ở thư mục gốc, chọn thư mục backup riêng ngoài repository và hạn chế quyền đọc. Thay đường dẫn ví dụ bằng nơi bạn quản lý:

```powershell
$productionBackupDirectory = 'C:\ThuChiBackups'
New-Item -ItemType Directory -Force -Path $productionBackupDirectory | Out-Null
$productionBackupFile = Join-Path $productionBackupDirectory ("thu-chi-prod-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
Push-Location apps/backend
npx.cmd wrangler d1 export DB --remote --env prod --output $productionBackupFile
Pop-Location
```

File SQL có dữ liệu tài chính và thông tin nhạy cảm của tài khoản, không phải archive mã hóa của P11A. Mã hóa/lưu trữ bằng giải pháp backup của bạn; không commit hoặc gửi file công khai. Xem [D1 export](https://developers.cloudflare.com/d1/wrangler-commands/).

### 17.2. D1 Time Travel

D1 cung cấp Time Travel theo cửa sổ khôi phục của gói đang dùng. Kiểm tra thời hạn thực tế trong [Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/); không coi đó là bản lưu dài hạn ngoài Cloudflare.

Lấy mốc hiện tại trước khi migration:

```powershell
Push-Location apps/backend
npx.cmd wrangler d1 time-travel info DB --env prod
Pop-Location
```

**Cách lấy `<BOOKMARK_DA_XAC_MINH>`:** đọc chuỗi sau thông báo **current bookmark** trong output của lệnh trên; lưu nguyên chuỗi cùng ngày giờ và D1 name. Bookmark không phải Database ID hoặc Version ID.

Nếu cần tìm mốc quá khứ theo thời gian, dùng cùng lệnh với `--timestamp`. Ví dụ sau chỉ **tra mốc**, chưa restore; thay ngày giờ bằng thời điểm cần phục hồi trong cửa sổ Time Travel của DB:

```powershell
Push-Location apps/backend
npx.cmd wrangler d1 time-travel info DB --env prod --timestamp "2026-10-30T14:00:00+07:00"
Pop-Location
```

`+07:00` biểu thị múi giờ Việt Nam/Thái Lan. Copy bookmark do lệnh trả về cho đúng thời điểm đó rồi thay vào lệnh restore. Không dùng chuỗi bookmark của ví dụ trên Internet. Xem [lấy bookmark Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

Khi có sự cố dữ liệu: tạm dừng thao tác ghi từ người dùng, tránh Cron/job ghi đồng thời, export trạng thái hiện tại và xác định đúng bookmark cần phục hồi. **Lệnh sau thay đổi DB production và có thể làm mất các thay đổi sau mốc chọn**; không chạy chỉ để thử:

```powershell
Push-Location apps/backend
npx.cmd wrangler d1 time-travel restore DB --env prod --bookmark <BOOKMARK_DA_XAC_MINH>
Pop-Location
```

Sau khôi phục, xác nhận schema phù hợp Worker đang chạy và kiểm tra lại đồng bộ thiết bị. Client có cursor/outbox cũ có thể cần quy trình đồng bộ lại có kiểm soát; tránh để dữ liệu chờ gửi ghi lại thay đổi vừa hoàn tác.

Thử phục hồi bản export trên database riêng trước khi dựa vào phương án này. Không import toàn bộ dump vào DB production đang có bảng để thử: cần thiết kế phục hồi phù hợp schema và ràng buộc dữ liệu.

## 18. Tự động hóa CI/CD sau lần deploy thủ công

Repository hiện có CI và workflow deploy/rollback **preview**; chưa có workflow production tương đương. Thư mục này cũng chưa được khởi tạo Git tại thời điểm soạn tài liệu.

Nếu muốn tự động hóa sau này:

1. Đưa mã nguồn và lockfile lên repository riêng, loại trừ secrets và file backup.
2. Tạo GitHub Environment `production`; cấu hình nhánh phát hành và người duyệt nếu đội của bạn cần.
3. Tạo Cloudflare API token riêng, giới hạn đúng account và quyền cần cho Workers deploy/D1 migrations; nếu quản lý custom domain qua CI, bổ sung quyền zone tương ứng theo tài liệu Wrangler.
4. Lưu token dưới dạng GitHub secret `CLOUDFLARE_API_TOKEN`, lưu Account ID và các giá trị cấu hình phù hợp; không đưa token vào frontend.
5. Workflow production cần chạy check/E2E, build frontend, kiểm tra `env.prod`, backup/migration, deploy và smoke test HTTPS.
6. Giới hạn một deployment production chạy tại một thời điểm; không tự hủy job đang migration.
7. Lưu Version ID trước/sau và quy trình rollback tách biệt với phục hồi D1.

Không đổi tên các biến `PREVIEW_*` rồi chạy script preview cho production: script hiện kiểm tra tên Worker/database phải có hậu tố `-preview` và dùng `APP_ENV=test`.

### 18.1. Tạo và lấy `CLOUDFLARE_API_TOKEN` cụ thể

Phần này chỉ cần cho CI/CD. Deploy thủ công bằng `wrangler login` ở bước 5 không yêu cầu bạn tạo token.

1. Đăng nhập dashboard; mở **My Profile → API Tokens** cho user token. Nếu tổ chức quản lý account token, dùng **Manage Account → API Tokens** theo chính sách tổ chức.
2. Chọn **Create Token**, đặt tên như `thu-chi-production-deploy`.
3. Dùng template **Edit Cloudflare Workers**, kiểm tra quyền và giới hạn tài nguyên về account production.
4. Thêm quyền D1 ghi/sửa cho workflow chạy migration; giới hạn zone nếu workflow quản lý tên miền.
5. Chọn **Continue to summary**, kiểm tra lại, rồi **Create Token**.
6. Copy **giá trị secret của token** ngay lúc được hiển thị và lưu vào secret CI `CLOUDFLARE_API_TOKEN`. Cloudflare chỉ hiển thị secret lần đầu.

Không copy tên token, Token ID hay Account ID vào trường token secret. Xem [tạo API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) và [xác thực CI cho Workers](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

### 18.2. Nguồn của từng biến CI

| Tên biến | Lấy giá trị ở đâu? | Có phải khóa bí mật? |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Giá trị token vừa tạo ở mục 18.1 | Có; lưu secret CI |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID lấy ở mục 2.1 | Là định danh account; không phải API token |
| D1 production ID nếu workflow dùng biến riêng | UUID D1 lấy ở mục 2.3 | Là định danh DB |
| Origin production nếu workflow dùng biến riêng | URL xác nhận ở mục 2.2 hoặc domain chính thức | Không |

`cloud.mjs` hiện đọc DB ID và origin từ `env.prod` trong file Wrangler; không tự đọc một biến CI mới chỉ vì bạn đặt tên cho nó. Nếu muốn cấu hình qua biến CI, cần bổ sung bước tạo cấu hình tương ứng trong workflow. Đoạn này mô tả nguồn thông số; chưa có workflow production được tạo sẵn trong repository.

## 19. Trình tự thực hiện nhanh

1. Tạo Cloudflare account, xác minh email và thiết lập Workers subdomain.
2. Cài Node/dependencies và chạy check/E2E.
3. `wrangler login`, xác nhận account.
4. Tạo D1 `thu-chi-prod`, lấy Database ID.
5. Điền Account ID và cấu hình `env.prod` có assets, DB, origin, Cron.
6. `cloud:check` → `cloud:migrate`; xác nhận schema `12`.
7. Build frontend với API base trống → dry-run production → `cloud:deploy`.
8. Kiểm tra HTTPS và health.
9. Tạo Super Admin bằng quy trình production một lần.
10. Upload bộ khóa push riêng và kiểm tra Cron/PWA/Passkey.
11. Gắn domain chính thức nếu có, kiểm tra lại mọi luồng trên domain đó.
12. Hoàn thành nghiệm thu, lưu Version ID và thiết lập backup/restore vận hành.

Production đã truy cập được vẫn cần hoàn thiện P11A và các mục nghiệm thu còn thiếu trước khi coi là bản phát hành hoàn chỉnh cho dữ liệu tài chính quan trọng.
