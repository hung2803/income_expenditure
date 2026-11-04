export interface AuditEventInput {
  actorUserId: string;
  ownerUserId: string;
  entity: string;
  recordId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  createdAt?: number;
}

export function insertAuditStatement(db: D1Database, event: AuditEventInput) {
  return db.prepare(`INSERT INTO admin_audit_log(id,actor_user_id,owner_user_id,entity,record_id,action,before_json,after_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(
    crypto.randomUUID(), event.actorUserId, event.ownerUserId, event.entity, event.recordId, event.action,
    event.before === undefined ? null : JSON.stringify(event.before),
    event.after === undefined ? null : JSON.stringify(event.after), event.createdAt ?? Date.now()
  );
}

export async function recordAdminFinanceChange(
  db: D1Database,
  actor: { id: string; role: string },
  ownerUserId: string,
  entity: string,
  recordId: string,
  action: string,
  after?: unknown
) {
  if (actor.role !== 'SUPER_ADMIN') return;
  await insertAuditStatement(db, { actorUserId: actor.id, ownerUserId, entity, recordId, action, after }).run();
}
