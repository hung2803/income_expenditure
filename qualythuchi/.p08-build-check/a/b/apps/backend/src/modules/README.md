# Backend modules

Mỗi module có thể tách `routes.ts`, `service.ts`, `repository.ts`, `schema.ts`
và test khi cần. Route xử lý HTTP; service giữ nghiệp vụ; repository truy cập D1.
Không tạo endpoint nghiệp vụ chưa có kiểm tra session/ownerUserId tương ứng.
