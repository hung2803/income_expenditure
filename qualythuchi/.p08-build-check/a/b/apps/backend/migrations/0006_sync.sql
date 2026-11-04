CREATE TABLE sync_changes (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK (entity IN ('wallet', 'category', 'transaction', 'transfer')),
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('UPSERT', 'DELETE')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  changed_at INTEGER NOT NULL
);
CREATE INDEX sync_changes_owner_cursor ON sync_changes(owner_user_id, cursor);

CREATE TABLE sync_batches (
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_user_id, idempotency_key)
);
CREATE TABLE sync_assertions (
  id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK (valid = 1)
);
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TRIGGER sync_wallet_insert AFTER INSERT ON wallets BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(NEW.owner_user_id, 'wallet', NEW.id, 1, 'UPSERT', json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'type',NEW.type,'openingBalance',NEW.opening_balance,'accountLabel',NEW.account_label,'accountReference',NEW.account_reference,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at), NEW.updated_at);
END;
CREATE TRIGGER sync_wallet_update AFTER UPDATE ON wallets BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(NEW.owner_user_id, 'wallet', NEW.id, (SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=NEW.owner_user_id AND entity='wallet' AND record_id=NEW.id)+1, 'UPSERT', json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'type',NEW.type,'openingBalance',NEW.opening_balance,'accountLabel',NEW.account_label,'accountReference',NEW.account_reference,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at), NEW.updated_at);
END;
CREATE TRIGGER sync_wallet_delete AFTER DELETE ON wallets BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(OLD.owner_user_id, 'wallet', OLD.id, (SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=OLD.owner_user_id AND entity='wallet' AND record_id=OLD.id)+1, 'DELETE', json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id), CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER sync_category_insert AFTER INSERT ON categories BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(NEW.owner_user_id, 'category', NEW.id, 1, 'UPSERT', json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'type',NEW.type,'name',NEW.name,'isDefault',NEW.is_default,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at), NEW.updated_at);
END;
CREATE TRIGGER sync_category_update AFTER UPDATE ON categories BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(NEW.owner_user_id, 'category', NEW.id, (SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=NEW.owner_user_id AND entity='category' AND record_id=NEW.id)+1, 'UPSERT', json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'type',NEW.type,'name',NEW.name,'isDefault',NEW.is_default,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at), NEW.updated_at);
END;
CREATE TRIGGER sync_category_delete AFTER DELETE ON categories BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(OLD.owner_user_id, 'category', OLD.id, (SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=OLD.owner_user_id AND entity='category' AND record_id=OLD.id)+1, 'DELETE', json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id), CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TRIGGER sync_transaction_insert AFTER INSERT ON transactions BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(NEW.owner_user_id, 'transaction', NEW.id, NEW.revision, 'UPSERT', json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'walletId',NEW.wallet_id,'categoryId',NEW.category_id,'type',NEW.type,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'note',NEW.note,'tags',json(NEW.tags_json),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at,'revision',NEW.revision), NEW.updated_at);
END;
CREATE TRIGGER sync_transaction_update AFTER UPDATE ON transactions BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(NEW.owner_user_id, 'transaction', NEW.id, NEW.revision, CASE WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'DELETE' ELSE 'UPSERT' END, json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'walletId',NEW.wallet_id,'categoryId',NEW.category_id,'type',NEW.type,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'note',NEW.note,'tags',json(NEW.tags_json),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at,'revision',NEW.revision), NEW.updated_at);
END;
CREATE TRIGGER sync_transfer_insert AFTER INSERT ON transfers BEGIN
  INSERT INTO sync_changes(owner_user_id, entity, record_id, revision, operation, payload_json, changed_at)
  VALUES(NEW.owner_user_id, 'transfer', NEW.id, NEW.revision, 'UPSERT', json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'sourceWalletId',NEW.source_wallet_id,'destinationWalletId',NEW.destination_wallet_id,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'createdAt',NEW.created_at,'revision',NEW.revision), NEW.created_at);
END;

UPDATE app_metadata SET value = '6' WHERE key = 'schema_version';
