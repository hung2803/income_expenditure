CREATE TABLE auth_roles (
  name TEXT PRIMARY KEY NOT NULL CHECK (name IN ('USER', 'SUPER_ADMIN'))
);
INSERT INTO auth_roles (name) VALUES ('USER'), ('SUPER_ADMIN');

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT COLLATE NOCASE UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES auth_roles(name),
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  revoked_at INTEGER
);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0)
);
CREATE INDEX auth_rate_limits_window ON auth_rate_limits(window_start);

-- A persistent singleton prevents bootstrap from being reopened after accounts
-- are removed. Bootstrap is performed by the operator, never by a public route.
CREATE TABLE auth_bootstrap (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);

CREATE TRIGGER auth_bootstrap_first_admin
AFTER INSERT ON users
WHEN NEW.role = 'SUPER_ADMIN'
  AND (SELECT COUNT(*) FROM users) = 1
  AND NOT EXISTS (SELECT 1 FROM auth_bootstrap)
BEGIN
  INSERT INTO auth_bootstrap (singleton, user_id, created_at) VALUES (1, NEW.id, NEW.created_at);
END;

UPDATE app_metadata SET value = '2' WHERE key = 'schema_version';
