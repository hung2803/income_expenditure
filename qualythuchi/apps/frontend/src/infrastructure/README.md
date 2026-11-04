# Infrastructure

`api/` chứa HTTP client. Các adapter dự kiến: `db/` (Dexie), `sync/` (outbox,
push/pull, revision), `backup/` (archive/crypto), `auth/`, `notifications/`.
Không lưu password, OAuth secret hoặc recovery key plaintext trong frontend.
