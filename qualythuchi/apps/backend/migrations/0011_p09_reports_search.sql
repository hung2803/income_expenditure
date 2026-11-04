CREATE INDEX transactions_owner_active_date_type
  ON transactions(owner_user_id, deleted_at, occurred_at DESC, type, amount);
CREATE INDEX transactions_owner_active_category_date
  ON transactions(owner_user_id, deleted_at, category_id, occurred_at DESC);
CREATE INDEX transactions_owner_active_wallet_date
  ON transactions(owner_user_id, deleted_at, wallet_id, occurred_at DESC);
CREATE INDEX transactions_owner_active_amount_date
  ON transactions(owner_user_id, deleted_at, amount, occurred_at DESC);

UPDATE app_metadata SET value = '11' WHERE key = 'schema_version';
