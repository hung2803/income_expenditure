DROP TRIGGER sync_wallet_insert;
DROP TRIGGER sync_wallet_update;
DROP TRIGGER sync_wallet_delete;
DROP TRIGGER sync_category_insert;
DROP TRIGGER sync_category_update;
DROP TRIGGER sync_category_delete;
DROP TRIGGER sync_transaction_insert;
DROP TRIGGER sync_transaction_update;
DROP TRIGGER sync_transfer_insert;
DROP TRIGGER sync_budget_insert;
DROP TRIGGER sync_budget_update;
DROP TRIGGER sync_budget_delete;
CREATE TABLE sync_changes_v3 (
 cursor INTEGER PRIMARY KEY AUTOINCREMENT,
 owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 entity TEXT NOT NULL CHECK(entity IN ('wallet','category','transaction','transfer','budget','savings_goal','savings_contribution','recurring_schedule')),
 record_id TEXT NOT NULL, revision INTEGER NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('UPSERT','DELETE')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), changed_at INTEGER NOT NULL
);
INSERT INTO sync_changes_v3(cursor,owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
 SELECT cursor,owner_user_id,entity,record_id,revision,operation,payload_json,changed_at FROM sync_changes ORDER BY cursor;
DROP TABLE sync_changes;
ALTER TABLE sync_changes_v3 RENAME TO sync_changes;
CREATE INDEX sync_changes_owner_cursor ON sync_changes(owner_user_id,cursor);
CREATE TRIGGER sync_wallet_insert AFTER INSERT ON wallets BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'wallet',NEW.id,1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'type',NEW.type,'openingBalance',NEW.opening_balance,'accountLabel',NEW.account_label,'accountReference',NEW.account_reference,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_wallet_update AFTER UPDATE ON wallets BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'wallet',NEW.id,(SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=NEW.owner_user_id AND entity='wallet' AND record_id=NEW.id)+1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'type',NEW.type,'openingBalance',NEW.opening_balance,'accountLabel',NEW.account_label,'accountReference',NEW.account_reference,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_wallet_delete AFTER DELETE ON wallets BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(OLD.owner_user_id,'wallet',OLD.id,(SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=OLD.owner_user_id AND entity='wallet' AND record_id=OLD.id)+1,'DELETE',json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id),CAST(strftime('%s','now') AS INTEGER)*1000);
END;
CREATE TRIGGER sync_category_insert AFTER INSERT ON categories BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'category',NEW.id,1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'type',NEW.type,'name',NEW.name,'isDefault',NEW.is_default,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_category_update AFTER UPDATE ON categories BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'category',NEW.id,(SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=NEW.owner_user_id AND entity='category' AND record_id=NEW.id)+1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'type',NEW.type,'name',NEW.name,'isDefault',NEW.is_default,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_category_delete AFTER DELETE ON categories BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(OLD.owner_user_id,'category',OLD.id,(SELECT COUNT(*) FROM sync_changes WHERE owner_user_id=OLD.owner_user_id AND entity='category' AND record_id=OLD.id)+1,'DELETE',json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id),CAST(strftime('%s','now') AS INTEGER)*1000);
END;
CREATE TRIGGER sync_transaction_insert AFTER INSERT ON transactions BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'transaction',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'walletId',NEW.wallet_id,'categoryId',NEW.category_id,'type',NEW.type,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'note',NEW.note,'tags',json(NEW.tags_json),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at,'revision',NEW.revision),NEW.updated_at);
END;
CREATE TRIGGER sync_transaction_update AFTER UPDATE ON transactions BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'transaction',NEW.id,NEW.revision,CASE WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN 'DELETE' ELSE 'UPSERT' END,json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'walletId',NEW.wallet_id,'categoryId',NEW.category_id,'type',NEW.type,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'note',NEW.note,'tags',json(NEW.tags_json),'createdAt',NEW.created_at,'updatedAt',NEW.updated_at,'deletedAt',NEW.deleted_at,'revision',NEW.revision),NEW.updated_at);
END;
CREATE TRIGGER sync_transfer_insert AFTER INSERT ON transfers BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'transfer',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'sourceWalletId',NEW.source_wallet_id,'destinationWalletId',NEW.destination_wallet_id,'amount',NEW.amount,'occurredAt',NEW.occurred_at,'createdAt',NEW.created_at,'revision',NEW.revision),NEW.created_at);
END;
CREATE TRIGGER sync_budget_insert AFTER INSERT ON budgets BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'budget',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'categoryId',NEW.category_id,'period',NEW.period,'amount',NEW.amount,'revision',NEW.revision,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_budget_update AFTER UPDATE ON budgets BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(NEW.owner_user_id,'budget',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'categoryId',NEW.category_id,'period',NEW.period,'amount',NEW.amount,'revision',NEW.revision,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER sync_budget_delete AFTER DELETE ON budgets BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at) VALUES(OLD.owner_user_id,'budget',OLD.id,OLD.revision+1,'DELETE',json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id,'revision',OLD.revision+1),CAST(strftime('%s','now') AS INTEGER)*1000);
END;

CREATE TABLE savings_goals (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=200),
  target_amount INTEGER NOT NULL CHECK(target_amount BETWEEN 1 AND 9007199254740991),
  due_date TEXT CHECK(due_date IS NULL OR (length(due_date)=10 AND due_date GLOB '????-??-??')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','PAUSED')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_user_id,id)
);
CREATE INDEX savings_goals_owner_status ON savings_goals(owner_user_id,status,due_date);
CREATE TABLE savings_contributions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 9007199254740991),
  contributed_at INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=200),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(owner_user_id,goal_id) REFERENCES savings_goals(owner_user_id,id) ON DELETE CASCADE,
  UNIQUE(owner_user_id,id)
);
CREATE INDEX savings_contributions_goal ON savings_contributions(owner_user_id,goal_id,contributed_at);
CREATE TABLE recurring_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  type TEXT NOT NULL CHECK(type IN ('EXPENSE','INCOME')),
  amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 9007199254740991),
  wallet_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK(cadence IN ('DAILY','WEEKLY','MONTHLY')),
  interval_count INTEGER NOT NULL DEFAULT 1 CHECK(interval_count BETWEEN 1 AND 99),
  day_of_month INTEGER CHECK(day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  start_date TEXT NOT NULL CHECK(length(start_date)=10 AND start_date GLOB '????-??-??'),
  next_due_date TEXT NOT NULL CHECK(length(next_due_date)=10 AND next_due_date GLOB '????-??-??'),
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok' CHECK(length(timezone) BETWEEN 1 AND 64),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=200),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(owner_user_id,wallet_id) REFERENCES wallets(owner_user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(owner_user_id,category_id) REFERENCES categories(owner_user_id,id) ON DELETE RESTRICT,
  UNIQUE(owner_user_id,id)
);
CREATE INDEX recurring_schedules_due ON recurring_schedules(is_active,next_due_date,owner_user_id);
CREATE TABLE savings_milestone_events (
 owner_user_id TEXT NOT NULL,
 goal_id TEXT NOT NULL,
 milestone INTEGER NOT NULL CHECK(milestone IN (25,50,75,100)),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(owner_user_id,goal_id,milestone),
 FOREIGN KEY(owner_user_id,goal_id) REFERENCES savings_goals(owner_user_id,id) ON DELETE CASCADE
);
CREATE TABLE recurring_confirmations (
  owner_user_id TEXT NOT NULL,
  schedule_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  confirmed_at INTEGER NOT NULL,
  PRIMARY KEY(owner_user_id,schedule_id,due_date),
  FOREIGN KEY(owner_user_id,schedule_id) REFERENCES recurring_schedules(owner_user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT
);
CREATE TRIGGER savings_goals_sync_insert AFTER INSERT ON savings_goals BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
 VALUES(NEW.owner_user_id,'savings_goal',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'description',NEW.description,'targetAmount',NEW.target_amount,'dueDate',NEW.due_date,'status',NEW.status,'revision',NEW.revision,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER savings_goals_sync_update AFTER UPDATE ON savings_goals BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
 VALUES(NEW.owner_user_id,'savings_goal',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'description',NEW.description,'targetAmount',NEW.target_amount,'dueDate',NEW.due_date,'status',NEW.status,'revision',NEW.revision,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER savings_goals_sync_delete AFTER DELETE ON savings_goals BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
 VALUES(OLD.owner_user_id,'savings_goal',OLD.id,OLD.revision+1,'DELETE',json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id),CAST(strftime('%s','now') AS INTEGER)*1000);
END;
CREATE TRIGGER savings_contributions_sync_insert AFTER INSERT ON savings_contributions BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
 VALUES(NEW.owner_user_id,'savings_contribution',NEW.id,1,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'goalId',NEW.goal_id,'amount',NEW.amount,'contributedAt',NEW.contributed_at,'note',NEW.note,'createdAt',NEW.created_at),NEW.created_at);
END;
CREATE TRIGGER savings_contribution_milestones AFTER INSERT ON savings_contributions BEGIN
 INSERT OR IGNORE INTO savings_milestone_events(owner_user_id,goal_id,milestone,created_at)
 SELECT NEW.owner_user_id,NEW.goal_id,m.milestone,NEW.created_at FROM (SELECT 25 AS milestone UNION SELECT 50 UNION SELECT 75 UNION SELECT 100) m
 JOIN savings_goals g ON g.owner_user_id=NEW.owner_user_id AND g.id=NEW.goal_id
 WHERE (SELECT COALESCE(SUM(amount),0) FROM savings_contributions WHERE owner_user_id=NEW.owner_user_id AND goal_id=NEW.goal_id)*100 >= g.target_amount*m.milestone;
 INSERT OR IGNORE INTO notifications(id,owner_user_id,kind,dedupe_key,title,body,payload_json,created_at)
 SELECT lower(hex(randomblob(16))),e.owner_user_id,'DAILY_REMINDER','savings:'||e.goal_id||':'||e.milestone,'Mục tiêu tiết kiệm đạt '||e.milestone||'%',g.name,json_object('goalId',e.goal_id,'milestone',e.milestone),e.created_at
 FROM savings_milestone_events e JOIN savings_goals g ON g.owner_user_id=e.owner_user_id AND g.id=e.goal_id
 WHERE e.owner_user_id=NEW.owner_user_id AND e.goal_id=NEW.goal_id AND e.created_at=NEW.created_at;
 INSERT OR IGNORE INTO notification_deliveries(notification_id,subscription_id,status,attempts,next_attempt_at,created_at)
 SELECT n.id,p.id,'PENDING',0,NEW.created_at,NEW.created_at FROM notifications n JOIN push_subscriptions p ON p.owner_user_id=n.owner_user_id AND p.disabled_at IS NULL
 WHERE n.owner_user_id=NEW.owner_user_id AND n.dedupe_key LIKE 'savings:'||NEW.goal_id||':%';
END;
CREATE TRIGGER recurring_schedules_sync_insert AFTER INSERT ON recurring_schedules BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
 VALUES(NEW.owner_user_id,'recurring_schedule',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'type',NEW.type,'amount',NEW.amount,'walletId',NEW.wallet_id,'categoryId',NEW.category_id,'cadence',NEW.cadence,'intervalCount',NEW.interval_count,'dayOfMonth',NEW.day_of_month,'startDate',NEW.start_date,'nextDueDate',NEW.next_due_date,'timezone',NEW.timezone,'note',NEW.note,'isActive',NEW.is_active,'revision',NEW.revision,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER recurring_schedules_sync_update AFTER UPDATE ON recurring_schedules BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
 VALUES(NEW.owner_user_id,'recurring_schedule',NEW.id,NEW.revision,'UPSERT',json_object('id',NEW.id,'ownerUserId',NEW.owner_user_id,'name',NEW.name,'type',NEW.type,'amount',NEW.amount,'walletId',NEW.wallet_id,'categoryId',NEW.category_id,'cadence',NEW.cadence,'intervalCount',NEW.interval_count,'dayOfMonth',NEW.day_of_month,'startDate',NEW.start_date,'nextDueDate',NEW.next_due_date,'timezone',NEW.timezone,'note',NEW.note,'isActive',NEW.is_active,'revision',NEW.revision,'createdAt',NEW.created_at,'updatedAt',NEW.updated_at),NEW.updated_at);
END;
CREATE TRIGGER recurring_schedules_sync_delete AFTER DELETE ON recurring_schedules BEGIN
 INSERT INTO sync_changes(owner_user_id,entity,record_id,revision,operation,payload_json,changed_at)
 VALUES(OLD.owner_user_id,'recurring_schedule',OLD.id,OLD.revision+1,'DELETE',json_object('id',OLD.id,'ownerUserId',OLD.owner_user_id),CAST(strftime('%s','now') AS INTEGER)*1000);
END;
UPDATE app_metadata SET value='12' WHERE key='schema_version';
