-- Budget rows are introduced here so Super Admin can manage per-user budgets
-- during P06. Aggregations and threshold notifications remain P07 scope.
CREATE TABLE budgets (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT,
  period TEXT NOT NULL CHECK (
    length(period) = 7 AND period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'
    AND substr(period, 6, 2) BETWEEN '01' AND '12'
  ),
  amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 9007199254740991),
  scope_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (scope_key = COALESCE(category_id, '')),
  UNIQUE(owner_user_id, period, scope_key),
  FOREIGN KEY(owner_user_id, category_id) REFERENCES categories(owner_user_id, id) ON DELETE RESTRICT
);
CREATE INDEX budgets_owner_period ON budgets(owner_user_id, period, category_id);

-- Add budgets to the ordered sync stream while preserving all existing cursors.
DROP TRIGGER sync_wallet_insert;
DROP TRIGGER sync_wallet_update;
DROP TRIGGER sync_wallet_delete;
DROP TRIGGER sync_category_insert;
DROP TRIGGER sync_category_update;
DROP TRIGGER sync_category_delete;
DROP TRIGGER sync_transaction_insert;
DROP TRIGGER sync_transaction_update;
DROP TRIGGER sync_transfer_insert;
CREATE TABLE sync_changes_v2 (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK (entity IN ('wallet', 'category', 'transaction', 'transfer', 'budget')),
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('UPSERT', 'DELETE')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  changed_at INTEGER NOT NULL
);
INSERT INTO sync_changes_v2(cursor,owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  SELECT cursor,owner_user_id,entity,record_id,revision,operation,payload_json,changed_at FROM sync_changes ORDER BY cursor;
DROP TABLE sync_changes;
ALTER TABLE sync_changes_v2 RENAME TO sync_changes;
CREATE INDEX sync_changes_owner_cursor ON sync_changes(owner_user_id, cursor);

CREATE TRIGGER sync_wallet_insert AFTER INSERT ON wallets BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'wallet',NEW.id,1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'type',NEW.type,'openingBalance',NEW.opening_balance,'accountLabel',NEW.account_label,'accountReference',NEW.account_reference,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_wallet_update AFTER UPDATE ON wallets BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'wallet',NEW.id,(SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=NEW.owner_user_id AND entity='wallet' AND record_id=NEW.id)+1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'type',NEW.type,'openingBalance',NEW.opening_balance,'accountLabel',NEW.account_label,'accountReference',NEW.account_reference,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_wallet_delete AFTER DELETE ON wallets BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(OLD.owner_user_id,'wallet',OLD.id,(SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=OLD.owner_user_id AND entity='wallet' AND record_id=OLD.id)+1,'DELETE',json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id),CAST(strftime('%s','now') AS INTEGER)*1000);
END;
CREATE TRIGGER sync_category_insert AFTER INSERT ON categories BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'category',NEW.id,1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'type',NEW.type,'name',NEW.name,'isDefault',NEW.is_default,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_category_update AFTER UPDATE ON categories BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'category',NEW.id,(SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=NEW.owner_user_id AND entity='category' AND record_id=NEW.id)+1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'type',NEW.type,'name',NEW.name,'isDefault',NEW.is_default,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_category_delete AFTER DELETE ON categories BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(OLD.owner_user_id,'category',OLD.id,(SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=OLD.owner_user_id AND entity='category' AND record_id=OLD.id)+1,'DELETE',json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id),CAST(strftime('%s','now') AS INTEGER)*1000);
END;
CREATE TRIGGER sync_transaction_insert AFTER INSERT ON transactions BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'transaction',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'walletId',NEW.wallet_id,'categoryId',NEW.category_id,'type',NEW.type,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'note',NEW.note,'tags',json(NEW.tags_json),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at,'revision',NEW.revision),NEW.updated_at);
END;
CREATE TRIGGER sync_transaction_update AFTER UPDATE ON transactions BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'transaction',NEW.id,NEW.revision,CASE WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'DELETE' ELSE 'UPSERT' END,json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'walletId',NEW.wallet_id,'categoryId',NEW.category_id,'type',NEW.type,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'note',NEW.note,'tags',json(NEW.tags_json),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at,'revision',NEW.revision),NEW.updated_at);
END;
CREATE TRIGGER sync_transfer_insert AFTER INSERT ON transfers BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'transfer',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'sourceWalletId',NEW.source_wallet_id,'destinationWalletId',NEW.destination_wallet_id,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'createdAt',NEW.created_at,'revision',NEW.revision),NEW.created_at);
END;

CREATE TRIGGER sync_budget_insert AFTER INSERT ON budgets BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'budget',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'categoryId',NEW.category_id,'period',NEW.period,'amount',NEW.amount,'revision',NEW.revision,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_budget_update AFTER UPDATE ON budgets BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(NEW.owner_user_id,'budget',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'categoryId',NEW.category_id,'period',NEW.period,'amount',NEW.amount,'revision',NEW.revision,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_budget_delete AFTER DELETE ON budgets BEGIN
  INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
  VALUES(OLD.owner_user_id,'budget',OLD.id,OLD.revision+1,'DELETE',json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id,'revision',OLD.revision+1),CAST(strftime('%s','now') AS INTEGER)*1000);
END;

UPDATE app_metadata SET value = '8' WHERE key = 'schema_version';
