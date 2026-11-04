CREATE UNIQUE INDEX wallets_owner_id_unique ON wallets(owner_user_id, id);
CREATE UNIQUE INDEX categories_owner_id_unique ON categories(owner_user_id, id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 9007199254740991),
  occurred_at INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (owner_user_id, wallet_id) REFERENCES wallets(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, category_id) REFERENCES categories(owner_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX transactions_owner_occurred ON transactions(owner_user_id, occurred_at DESC, id);
CREATE INDEX transactions_owner_updated ON transactions(owner_user_id, updated_at, id, revision);
CREATE INDEX transactions_wallet_active ON transactions(owner_user_id, wallet_id, deleted_at);

UPDATE app_metadata SET value = '4' WHERE key = 'schema_version';
