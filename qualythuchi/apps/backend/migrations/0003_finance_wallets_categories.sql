CREATE TABLE wallets (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  normalized_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CASH', 'BANK', 'E_WALLET', 'OTHER')),
  opening_balance INTEGER NOT NULL DEFAULT 0 CHECK (opening_balance BETWEEN -9007199254740991 AND 9007199254740991),
  account_label TEXT NOT NULL DEFAULT '' CHECK (length(account_label) <= 30),
  account_reference TEXT NOT NULL DEFAULT '' CHECK (length(account_reference) <= 40),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_user_id, normalized_name)
);
CREATE INDEX wallets_owner_updated ON wallets(owner_user_id, updated_at DESC, id);

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 32),
  normalized_name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_user_id, type, normalized_name)
);
CREATE INDEX categories_owner_type_updated ON categories(owner_user_id, type, updated_at, id);

UPDATE app_metadata SET value = '3' WHERE key = 'schema_version';
