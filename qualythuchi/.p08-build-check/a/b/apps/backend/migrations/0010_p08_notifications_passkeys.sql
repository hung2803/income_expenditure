CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ceremony TEXT NOT NULL CHECK (ceremony IN ('REGISTRATION', 'AUTHENTICATION')),
  challenge TEXT NOT NULL,
  origin TEXT NOT NULL,
  rp_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX webauthn_challenges_expiry ON webauthn_challenges(expires_at);

CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(transports_json) AND json_type(transports_json) = 'array'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  device_type TEXT NOT NULL DEFAULT 'singleDevice',
  backed_up INTEGER NOT NULL DEFAULT 0 CHECK (backed_up IN (0, 1)),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX passkey_credentials_user ON passkey_credentials(user_id, created_at);

CREATE TABLE notification_settings (
  owner_user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok' CHECK (length(timezone) BETWEEN 1 AND 64),
  push_enabled INTEGER NOT NULL DEFAULT 0 CHECK (push_enabled IN (0, 1)),
  updated_at INTEGER NOT NULL
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL,
  subscription_ciphertext TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_sent_at INTEGER,
  disabled_at INTEGER,
  UNIQUE(owner_user_id, endpoint_hash)
);
CREATE INDEX push_subscriptions_active ON push_subscriptions(owner_user_id, disabled_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('DAILY_REMINDER', 'BUDGET_THRESHOLD')),
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 300),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload_json) AND json_type(payload_json) = 'object'),
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  UNIQUE(owner_user_id, dedupe_key)
);
CREATE INDEX notifications_inbox ON notifications(owner_user_id, created_at DESC, id);

CREATE TABLE notification_deliveries (
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'RETRY', 'SENT', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
  next_attempt_at INTEGER NOT NULL,
  locked_until INTEGER,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(notification_id, subscription_id)
);
CREATE INDEX notification_deliveries_due ON notification_deliveries(status, next_attempt_at, locked_until);

CREATE TRIGGER notification_from_budget_threshold AFTER INSERT ON budget_threshold_events BEGIN
  INSERT OR IGNORE INTO notifications(id,owner_user_id,kind,dedupe_key,title,body,payload_json,created_at)
  SELECT lower(hex(randomblob(16))),NEW.owner_user_id,'BUDGET_THRESHOLD',
    'budget:'||NEW.budget_id||':'||NEW.period||':'||NEW.milestone,
    CASE NEW.milestone WHEN 80 THEN 'Đã dùng 80% ngân sách' ELSE 'Đã đạt ngân sách tháng' END,
    CASE WHEN b.category_id IS NULL THEN 'Ngân sách tổng kỳ '||NEW.period
      ELSE 'Ngân sách danh mục '||COALESCE(c.name,'')||' kỳ '||NEW.period END,
    json_object('budgetId',NEW.budget_id,'period',NEW.period,'milestone',NEW.milestone),NEW.created_at
  FROM budgets b LEFT JOIN categories c ON c.owner_user_id=b.owner_user_id AND c.id=b.category_id
  WHERE b.owner_user_id=NEW.owner_user_id AND b.id=NEW.budget_id;
END;

INSERT OR IGNORE INTO notifications(id,owner_user_id,kind,dedupe_key,title,body,payload_json,created_at)
SELECT lower(hex(randomblob(16))),e.owner_user_id,'BUDGET_THRESHOLD',
  'budget:'||e.budget_id||':'||e.period||':'||e.milestone,
  CASE e.milestone WHEN 80 THEN 'Đã dùng 80% ngân sách' ELSE 'Đã đạt ngân sách tháng' END,
  CASE WHEN b.category_id IS NULL THEN 'Ngân sách tổng kỳ '||e.period
    ELSE 'Ngân sách danh mục '||COALESCE(c.name,'')||' kỳ '||e.period END,
  json_object('budgetId',e.budget_id,'period',e.period,'milestone',e.milestone),e.created_at
FROM budget_threshold_events e
LEFT JOIN budgets b ON b.owner_user_id=e.owner_user_id AND b.id=e.budget_id
LEFT JOIN categories c ON c.owner_user_id=b.owner_user_id AND c.id=b.category_id;

UPDATE app_metadata SET value = '10' WHERE key = 'schema_version';
