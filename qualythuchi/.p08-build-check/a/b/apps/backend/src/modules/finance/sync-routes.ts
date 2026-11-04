import { Hono } from 'hono';
import type { AuthEnvironment } from '../../middleware/auth';
import { requireAuth, requireCsrf, scopeOwner } from '../../middleware/auth';
import { AuthError } from '../auth/errors';
import { jsonBody } from '../auth/validation';
import { parseTransactionInput, parseTransferInput } from './validation';

export const syncRoutes = new Hono<AuthEnvironment>();
const path = '/users/:ownerUserId/sync';
type Change = { entity: 'transaction' | 'transfer'; operation: 'upsert' | 'delete'; id: string; revision?: number; data?: Record<string, unknown> };

syncRoutes.get(`${path}/pull`, requireAuth, scopeOwner, async (c) => {
  const cursor = Number(c.req.query('cursor') ?? '0');
  const limit = Number(c.req.query('limit') ?? '200');
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new AuthError(400, 'INVALID_INPUT', 'Cursor hoặc giới hạn đồng bộ không hợp lệ.');
  }
  const ownerId = c.get('ownerUserId');
  const result = await c.env.DB.prepare(`SELECT cursor, entity, record_id AS recordId, revision, operation, payload_json AS payloadJson, changed_at AS changedAt
    FROM sync_changes WHERE owner_user_id = ? AND cursor > ? ORDER BY cursor LIMIT ?`).bind(ownerId, cursor, limit + 1).all<{
      cursor: number; entity: string; recordId: string; revision: number; operation: string; payloadJson: string; changedAt: number;
    }>();
  const hasMore = result.results.length > limit;
  const changes = result.results.slice(0, limit).map((row) => ({ ...row, payload: JSON.parse(row.payloadJson) as unknown, payloadJson: undefined }));
  const nextCursor = changes.length ? changes[changes.length - 1]!.cursor : cursor;
  return c.json({ changes, cursor: nextCursor, hasMore });
});

syncRoutes.post(`${path}/push`, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const body = await jsonBody(c.req.raw);
  const key = body.idempotencyKey;
  if (typeof key !== 'string' || !/^[\w.:-]{8,128}$/u.test(key) || !Array.isArray(body.changes) || body.changes.length < 1 || body.changes.length > 100) {
    throw new AuthError(400, 'INVALID_INPUT', 'Batch đồng bộ cần idempotencyKey và từ 1 đến 100 thay đổi.');
  }
  const ownerId = c.get('ownerUserId');
  const actor = c.get('auth').dto.user;
  const normalized = body.changes.map(normalizeChange);
  const unique = new Set(normalized.map((change) => `${change.entity}:${change.id}`));
  if (unique.size !== normalized.length) throw new AuthError(400, 'INVALID_INPUT', 'Một batch không được chứa cùng bản ghi nhiều lần.');
  const canonical = JSON.stringify(normalized);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const db = c.env.DB.withSession('first-primary');
  const prior = await db.prepare('SELECT request_hash AS requestHash, response_json AS responseJson FROM sync_batches WHERE owner_user_id = ? AND idempotency_key = ?')
    .bind(ownerId, key).first<{ requestHash: string; responseJson: string }>();
  if (prior) {
    if (prior.requestHash !== hash) throw new AuthError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key đã được dùng cho nội dung khác.');
    return c.json(JSON.parse(prior.responseJson) as unknown);
  }

  const response = { idempotencyKey: key, applied: normalized.map(({ entity, operation, id }) => ({ entity, operation, id })) };
  const now = Date.now();
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO sync_batches(owner_user_id,idempotency_key,request_hash,response_json,created_at) VALUES(?,?,?,?,?)`)
    .bind(ownerId, key, hash, JSON.stringify(response), now)];
  const auditRows: Array<{ change: Change; before: string | null; after: string | null }> = [];
  for (const change of normalized) {
    if (change.entity === 'transaction') {
      const data = change.operation === 'upsert' ? parseTransactionInput({ ...change.data, id: change.id }) : undefined;
      const current = await db.prepare('SELECT revision, deleted_at AS deletedAt, wallet_id AS walletId, category_id AS categoryId FROM transactions WHERE owner_user_id=? AND id=?')
        .bind(ownerId, change.id).first<{ revision: number; deletedAt: number | null; walletId: string; categoryId: string }>();
      const expected = change.revision ?? 0;
      const guardId = crypto.randomUUID();
      const revisionMatches = change.operation === 'delete'
        ? 'EXISTS(SELECT 1 FROM transactions WHERE owner_user_id=? AND id=? AND revision=? AND deleted_at IS NULL)'
        : 'COALESCE((SELECT revision FROM transactions WHERE owner_user_id=? AND id=?),0)=?';
      statements.push(db.prepare(`INSERT INTO sync_assertions(id,valid) SELECT ?, CASE WHEN ${revisionMatches} THEN 1 ELSE 0 END`)
        .bind(guardId, ownerId, change.id, expected));
      statements.push(data
        ? db.prepare(`INSERT INTO transactions(id,owner_user_id,wallet_id,category_id,type,amount,occurred_at,note,tags_json,created_at,updated_at,deleted_at,revision)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,1)
            ON CONFLICT(id) DO UPDATE SET wallet_id=excluded.wallet_id,category_id=excluded.category_id,type=excluded.type,amount=excluded.amount,occurred_at=excluded.occurred_at,note=excluded.note,tags_json=excluded.tags_json,updated_at=excluded.updated_at,deleted_at=NULL,revision=transactions.revision+1
            WHERE transactions.owner_user_id=excluded.owner_user_id AND transactions.revision=?`)
          .bind(change.id, ownerId, data.walletId, data.categoryId, data.type, data.amount, data.occurredAt, data.note, JSON.stringify(data.tags), now, now, expected)
        : db.prepare('UPDATE transactions SET deleted_at=?,updated_at=?,revision=revision+1 WHERE owner_user_id=? AND id=? AND revision=? AND deleted_at IS NULL')
          .bind(now, now, ownerId, change.id, expected));
      statements.push(db.prepare('DELETE FROM sync_assertions WHERE id=?').bind(guardId));
      if (actor.role === 'SUPER_ADMIN' && actor.id !== ownerId) auditRows.push({ change, before: current ? JSON.stringify(current) : null, after: data ? JSON.stringify(data) : null });
    } else {
      if (change.operation !== 'upsert') throw new AuthError(400, 'INVALID_INPUT', 'Không hỗ trợ xóa chuyển khoản đã ghi sổ.');
      const data = parseTransferInput({ ...change.data, id: change.id });
      statements.push(db.prepare(`INSERT INTO transfers(id,owner_user_id,source_wallet_id,destination_wallet_id,type,amount,occurred_at,created_at,revision)
        VALUES(?,?,?,?,'TRANSFER',?,?,?,1)`).bind(change.id, ownerId, data.sourceWalletId, data.destinationWalletId, data.amount, data.occurredAt, now));
      if (actor.role === 'SUPER_ADMIN' && actor.id !== ownerId) auditRows.push({ change, before: null, after: JSON.stringify(data) });
    }
  }
  for (const audit of auditRows) statements.push(db.prepare(`INSERT INTO admin_audit_log(id,actor_user_id,owner_user_id,entity,record_id,action,before_json,after_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), actor.id, ownerId, audit.change.entity, audit.change.id, audit.change.operation.toUpperCase(), audit.before, audit.after, now));
  try {
    await db.batch(statements);
  } catch (error) {
    const replay = await db.prepare('SELECT request_hash AS requestHash, response_json AS responseJson FROM sync_batches WHERE owner_user_id=? AND idempotency_key=?').bind(ownerId, key).first<{ requestHash: string; responseJson: string }>();
    if (replay) {
      if (replay.requestHash !== hash) throw new AuthError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key đã được dùng cho nội dung khác.');
      return c.json(JSON.parse(replay.responseJson) as unknown);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/sync_assertions|CHECK constraint failed/i.test(message)) throw new AuthError(409, 'REVISION_CONFLICT', 'Dữ liệu đã thay đổi trên máy chủ. Hãy đồng bộ lại trước khi thử.');
    throw error;
  }
  return c.json(response, 200);
});

function normalizeChange(value: unknown): Change {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError(400, 'INVALID_INPUT', 'Thay đổi đồng bộ không hợp lệ.');
  const item = value as Record<string, unknown>;
  if ((item.entity !== 'transaction' && item.entity !== 'transfer') || (item.operation !== 'upsert' && item.operation !== 'delete')
    || typeof item.id !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/u.test(item.id)
    || (item.revision !== undefined && (!Number.isSafeInteger(item.revision) || (item.revision as number) < 0))
    || (item.data !== undefined && (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)))) {
    throw new AuthError(400, 'INVALID_INPUT', 'Thay đổi đồng bộ không hợp lệ.');
  }
  if (item.operation === 'upsert' && !item.data) throw new AuthError(400, 'INVALID_INPUT', 'Thiếu dữ liệu bản ghi đồng bộ.');
  return { entity: item.entity, operation: item.operation, id: item.id, ...(item.revision === undefined ? {} : { revision: item.revision as number }), ...(item.data ? { data: item.data as Record<string, unknown> } : {}) };
}
