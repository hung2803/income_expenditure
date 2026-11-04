CREATE TABLE transfers (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_wallet_id TEXT NOT NULL,
  destination_wallet_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'TRANSFER' CHECK (type = 'TRANSFER'),
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 9007199254740991),
  occurred_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CHECK (source_wallet_id <> destination_wallet_id),
  FOREIGN KEY (owner_user_id, source_wallet_id) REFERENCES wallets(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, destination_wallet_id) REFERENCES wallets(owner_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX transfers_owner_occurred ON transfers(owner_user_id, occurred_at DESC, id);
CREATE INDEX transfers_source_wallet ON transfers(owner_user_id, source_wallet_id);
CREATE INDEX transfers_destination_wallet ON transfers(owner_user_id, destination_wallet_id);

UPDATE app_metadata SET value = '5' WHERE key = 'schema_version';
