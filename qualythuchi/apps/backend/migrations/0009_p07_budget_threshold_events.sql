CREATE TABLE budget_threshold_events (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  budget_id TEXT NOT NULL,
  period TEXT NOT NULL,
  milestone INTEGER NOT NULL CHECK (milestone IN (80, 100)),
  spent_amount INTEGER NOT NULL CHECK (spent_amount >= 0),
  budget_amount INTEGER NOT NULL CHECK (budget_amount > 0),
  created_at INTEGER NOT NULL,
  UNIQUE(owner_user_id, budget_id, period, milestone)
);
CREATE INDEX budget_threshold_events_owner_period ON budget_threshold_events(owner_user_id, period, created_at DESC);

-- The unique key makes a milestone a once-per-budget-period event, even when
-- several writes or sync retries recalculate the same aggregate.
CREATE TRIGGER budget_threshold_on_transaction_insert AFTER INSERT ON transactions BEGIN
  INSERT OR IGNORE INTO budget_threshold_events(id,owner_user_id,budget_id,period,milestone,spent_amount,budget_amount,created_at)
  SELECT lower(hex(randomblob(16))),b.owner_user_id,b.id,b.period,m.milestone,
    (SELECT COALESCE(SUM(t.amount),0) FROM transactions t
      WHERE t.owner_user_id=b.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',b.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(b.period||'-01','+1 month')) AS INTEGER)*1000
        AND (b.category_id IS NULL OR t.category_id=b.category_id)), b.amount,
    CAST(strftime('%s','now') AS INTEGER)*1000
  FROM budgets b CROSS JOIN (SELECT 80 AS milestone UNION ALL SELECT 100) m
  WHERE b.owner_user_id=NEW.owner_user_id
    AND (b.category_id IS NULL OR b.category_id=NEW.category_id)
    AND NEW.type='EXPENSE' AND NEW.deleted_at IS NULL
    AND NEW.occurred_at >= CAST(strftime('%s',b.period||'-01') AS INTEGER)*1000
    AND NEW.occurred_at < CAST(strftime('%s',date(b.period||'-01','+1 month')) AS INTEGER)*1000
    AND (SELECT COALESCE(SUM(t.amount),0) FROM transactions t
      WHERE t.owner_user_id=b.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',b.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(b.period||'-01','+1 month')) AS INTEGER)*1000
        AND (b.category_id IS NULL OR t.category_id=b.category_id)
    ) >= (b.amount*m.milestone+99)/100;
END;

CREATE TRIGGER budget_threshold_on_transaction_update AFTER UPDATE ON transactions BEGIN
  INSERT OR IGNORE INTO budget_threshold_events(id,owner_user_id,budget_id,period,milestone,spent_amount,budget_amount,created_at)
  SELECT lower(hex(randomblob(16))),b.owner_user_id,b.id,b.period,m.milestone,
    (SELECT COALESCE(SUM(t.amount),0) FROM transactions t
      WHERE t.owner_user_id=b.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',b.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(b.period||'-01','+1 month')) AS INTEGER)*1000
        AND (b.category_id IS NULL OR t.category_id=b.category_id)), b.amount,
    CAST(strftime('%s','now') AS INTEGER)*1000
  FROM budgets b CROSS JOIN (SELECT 80 AS milestone UNION ALL SELECT 100) m
  WHERE b.owner_user_id=NEW.owner_user_id
    AND (b.category_id IS NULL OR b.category_id IN (OLD.category_id,NEW.category_id))
    AND ((NEW.type='EXPENSE' AND NEW.deleted_at IS NULL AND NEW.occurred_at >= CAST(strftime('%s',b.period||'-01') AS INTEGER)*1000
      AND NEW.occurred_at < CAST(strftime('%s',date(b.period||'-01','+1 month')) AS INTEGER)*1000)
      OR (OLD.type='EXPENSE' AND OLD.deleted_at IS NULL AND OLD.occurred_at >= CAST(strftime('%s',b.period||'-01') AS INTEGER)*1000
      AND OLD.occurred_at < CAST(strftime('%s',date(b.period||'-01','+1 month')) AS INTEGER)*1000))
    AND (SELECT COALESCE(SUM(t.amount),0) FROM transactions t
      WHERE t.owner_user_id=b.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',b.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(b.period||'-01','+1 month')) AS INTEGER)*1000
        AND (b.category_id IS NULL OR t.category_id=b.category_id)
    ) >= (b.amount*m.milestone+99)/100;
END;

CREATE TRIGGER budget_threshold_on_budget_insert AFTER INSERT ON budgets BEGIN
  INSERT OR IGNORE INTO budget_threshold_events(id,owner_user_id,budget_id,period,milestone,spent_amount,budget_amount,created_at)
  SELECT lower(hex(randomblob(16))),NEW.owner_user_id,NEW.id,NEW.period,m.milestone,
    (SELECT COALESCE(SUM(t.amount),0) FROM transactions t
      WHERE t.owner_user_id=NEW.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',NEW.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(NEW.period||'-01','+1 month')) AS INTEGER)*1000
        AND (NEW.category_id IS NULL OR t.category_id=NEW.category_id)), NEW.amount,
    CAST(strftime('%s','now') AS INTEGER)*1000
  FROM (SELECT 80 AS milestone UNION ALL SELECT 100) m
  WHERE (SELECT COALESCE(SUM(t.amount),0) FROM transactions t
      WHERE t.owner_user_id=NEW.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',NEW.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(NEW.period||'-01','+1 month')) AS INTEGER)*1000
        AND (NEW.category_id IS NULL OR t.category_id=NEW.category_id)
    ) >= (NEW.amount*m.milestone+99)/100;
END;

CREATE TRIGGER budget_threshold_on_budget_update AFTER UPDATE ON budgets BEGIN
  INSERT OR IGNORE INTO budget_threshold_events(id,owner_user_id,budget_id,period,milestone,spent_amount,budget_amount,created_at)
  SELECT lower(hex(randomblob(16))),NEW.owner_user_id,NEW.id,NEW.period,m.milestone,
    (SELECT COALESCE(SUM(t.amount),0) FROM transactions t
      WHERE t.owner_user_id=NEW.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',NEW.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(NEW.period||'-01','+1 month')) AS INTEGER)*1000
        AND (NEW.category_id IS NULL OR t.category_id=NEW.category_id)), NEW.amount,
    CAST(strftime('%s','now') AS INTEGER)*1000
  FROM (SELECT 80 AS milestone UNION ALL SELECT 100) m
  WHERE (SELECT COALESCE(SUM(t.amount),0) FROM transactions t
      WHERE t.owner_user_id=NEW.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',NEW.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(NEW.period||'-01','+1 month')) AS INTEGER)*1000
        AND (NEW.category_id IS NULL OR t.category_id=NEW.category_id)
    ) >= (NEW.amount*m.milestone+99)/100;
END;

UPDATE app_metadata SET value = '9' WHERE key = 'schema_version';
