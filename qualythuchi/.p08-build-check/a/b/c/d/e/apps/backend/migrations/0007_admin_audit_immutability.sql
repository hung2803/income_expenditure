-- Audit is append-only: application code can insert events, but no UPDATE or
-- DELETE may alter the historical actor, target, action, or timestamp.
CREATE TRIGGER admin_audit_log_no_update
BEFORE UPDATE ON admin_audit_log
BEGIN
  SELECT RAISE(ABORT, 'admin_audit_log is immutable');
END;

CREATE TRIGGER admin_audit_log_no_delete
BEFORE DELETE ON admin_audit_log
BEGIN
  SELECT RAISE(ABORT, 'admin_audit_log is immutable');
END;

UPDATE app_metadata SET value = '7' WHERE key = 'schema_version';
