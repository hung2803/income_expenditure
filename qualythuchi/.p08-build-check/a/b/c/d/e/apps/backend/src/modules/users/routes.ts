import { Hono } from 'hono';
import type { AuthEnvironment } from '../../middleware/auth';
import { requireAuth, requireCsrf, requireRole, scopeOwner } from '../../middleware/auth';
import { AuthRepository, publicUser } from '../auth/repository';
import { AuthError } from '../auth/errors';
import { jsonBody, normalizeUsername } from '../auth/validation';
import { hashPassword, validateNewPassword } from '../auth/password';
import { insertAuditStatement } from './audit';

// User identity, admin account management and audit read APIs.
export const userRoutes = new Hono<AuthEnvironment>();
userRoutes.get('/users/:ownerUserId', requireAuth, scopeOwner, async (c) => {
  const user = await new AuthRepository(c.env.DB).profile(c.get('ownerUserId'));
  if (!user) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.');
  return c.json({ user: publicUser(user) });
});
userRoutes.get('/admin/users', requireAuth, requireRole('SUPER_ADMIN'), async (c) => c.json({ users: await new AuthRepository(c.env.DB).listUsers() }));

userRoutes.post('/admin/users', requireAuth, requireRole('SUPER_ADMIN'), requireCsrf, async (c) => {
  const body = await jsonBody(c.req.raw);
  if (Object.keys(body).some((key) => !['username', 'displayName', 'password'].includes(key))) throw new AuthError(400, 'INVALID_INPUT', 'Thông tin tài khoản không hợp lệ.');
  const username = normalizeUsername(body.username);
  if (typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.trim().length > 80
    || Array.from(body.displayName).some((character) => character.charCodeAt(0) < 32)) throw new AuthError(400, 'INVALID_INPUT', 'Tên hiển thị cần từ 1 đến 80 ký tự.');
  if (typeof body.password !== 'string') throw new AuthError(400, 'INVALID_INPUT', 'Mật khẩu không hợp lệ.');
  try { validateNewPassword(body.password); } catch { throw new AuthError(400, 'INVALID_INPUT', 'Mật khẩu cần từ 8 đến 25 ký tự.'); }
  const id = crypto.randomUUID();
  const now = Date.now();
  const displayName = body.displayName.trim();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO users(id,username,display_name,role,password_hash,created_at,updated_at)
        VALUES(?,?,?,'USER',?,?,?)`).bind(id, username, displayName, await hashPassword(body.password), now, now),
      insertAuditStatement(c.env.DB, { actorUserId: c.get('auth').dto.user.id, ownerUserId: id, entity: 'user', recordId: id, action: 'CREATE', after: { username, displayName, role: 'USER', isActive: true }, createdAt: now })
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed: users\.username/i.test(error instanceof Error ? error.message : String(error))) {
      throw new AuthError(409, 'USERNAME_EXISTS', 'Tên đăng nhập này đã được sử dụng.');
    }
    throw error;
  }
  const user = await new AuthRepository(c.env.DB).profile(id);
  return c.json({ user: publicUser(user!) }, 201);
});

userRoutes.put('/admin/users/:userId', requireAuth, requireRole('SUPER_ADMIN'), requireCsrf, async (c) => {
  const body = await jsonBody(c.req.raw);
  if (Object.keys(body).some((key) => !['username', 'displayName', 'password', 'role', 'isActive'].includes(key)) || Object.keys(body).length === 0) {
    throw new AuthError(400, 'INVALID_INPUT', 'Thông tin tài khoản không hợp lệ.');
  }
  const userId = c.req.param('userId');
  const current = await c.env.DB.prepare('SELECT id,username,display_name AS displayName,role,is_active AS isActive FROM users WHERE id=?').bind(userId).first<{ id: string; username: string; displayName: string; role: 'USER' | 'SUPER_ADMIN'; isActive: number }>();
  if (!current) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.');
  const username = body.username === undefined ? current.username : normalizeUsername(body.username);
  const displayName = body.displayName === undefined ? current.displayName : typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName || displayName.length > 80 || Array.from(displayName).some((character) => character.charCodeAt(0) < 32)) throw new AuthError(400, 'INVALID_INPUT', 'Tên hiển thị cần từ 1 đến 80 ký tự.');
  const role = body.role === undefined ? current.role : body.role;
  if (role !== 'USER' && role !== 'SUPER_ADMIN') throw new AuthError(400, 'INVALID_INPUT', 'Vai trò không hợp lệ.');
  const isActive = body.isActive === undefined ? Boolean(current.isActive) : body.isActive;
  if (typeof isActive !== 'boolean') throw new AuthError(400, 'INVALID_INPUT', 'Trạng thái tài khoản không hợp lệ.');
  let passwordHash: string | undefined;
  if (body.password !== undefined) {
    if (typeof body.password !== 'string') throw new AuthError(400, 'INVALID_INPUT', 'Mật khẩu không hợp lệ.');
    try { validateNewPassword(body.password); } catch { throw new AuthError(400, 'INVALID_INPUT', 'Mật khẩu cần từ 8 đến 25 ký tự.'); }
    passwordHash = await hashPassword(body.password);
  }
  const actorId = c.get('auth').dto.user.id;
  if (actorId === userId && (!isActive || role !== 'SUPER_ADMIN')) throw new AuthError(409, 'LAST_ADMIN', 'Không thể tự vô hiệu hóa hoặc hạ quyền tài khoản quản trị đang đăng nhập.');
  if (current.role === 'SUPER_ADMIN' && current.isActive && (!isActive || role !== 'SUPER_ADMIN')) {
    const activeAdmins = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role='SUPER_ADMIN' AND is_active=1").first<{ count: number }>();
    if ((activeAdmins?.count ?? 0) <= 1) throw new AuthError(409, 'LAST_ADMIN', 'Hệ thống phải còn ít nhất một tài khoản quản trị đang hoạt động.');
  }
  const now = Date.now();
  const before = { username: current.username, displayName: current.displayName, role: current.role, isActive: Boolean(current.isActive) };
  const after = { username, displayName, role, isActive };
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE users SET username=?,display_name=?,role=?,is_active=?,password_hash=COALESCE(?,password_hash),
        auth_version=auth_version+CASE WHEN is_active<>? OR role<>? OR ? IS NOT NULL THEN 1 ELSE 0 END,updated_at=? WHERE id=?`)
        .bind(username, displayName, role, Number(isActive), passwordHash ?? null, Number(isActive), role, passwordHash ?? null, now, userId),
      insertAuditStatement(c.env.DB, { actorUserId: actorId, ownerUserId: userId, entity: 'user', recordId: userId, action: 'UPDATE', before, after, createdAt: now })
    ]);
  } catch (error) {
    if (/UNIQUE constraint failed: users\.username/i.test(error instanceof Error ? error.message : String(error))) throw new AuthError(409, 'USERNAME_EXISTS', 'Tên đăng nhập này đã được sử dụng.');
    throw error;
  }
  const user = await new AuthRepository(c.env.DB).profile(userId);
  return c.json({ user: publicUser(user!) });
});

// Deletion is a reversible account deactivation so financial history and audit
// foreign keys remain intact; auth_version revokes all existing sessions.
userRoutes.delete('/admin/users/:userId', requireAuth, requireRole('SUPER_ADMIN'), requireCsrf, async (c) => {
  const userId = c.req.param('userId');
  const current = await c.env.DB.prepare('SELECT id,username,display_name AS displayName,role,is_active AS isActive FROM users WHERE id=?').bind(userId).first<{ id: string; username: string; displayName: string; role: string; isActive: number }>();
  if (!current) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.');
  if (current.role === 'SUPER_ADMIN' && current.isActive) {
    const activeAdmins = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role='SUPER_ADMIN' AND is_active=1").first<{ count: number }>();
    if ((activeAdmins?.count ?? 0) <= 1) throw new AuthError(409, 'LAST_ADMIN', 'Hệ thống phải còn ít nhất một tài khoản quản trị đang hoạt động.');
  }
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET is_active=0,auth_version=auth_version+1,updated_at=? WHERE id=? AND is_active=1').bind(now, userId),
    insertAuditStatement(c.env.DB, { actorUserId: c.get('auth').dto.user.id, ownerUserId: userId, entity: 'user', recordId: userId, action: 'DEACTIVATE', before: { username: current.username, displayName: current.displayName, role: current.role, isActive: true }, after: { isActive: false }, createdAt: now })
  ]);
  return c.body(null, 204);
});

userRoutes.get('/admin/audit', requireAuth, requireRole('SUPER_ADMIN'), async (c) => {
  const limit = Number(c.req.query('limit') ?? '100');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new AuthError(400, 'INVALID_INPUT', 'Giới hạn nhật ký không hợp lệ.');
  const result = await c.env.DB.prepare(`SELECT a.id, a.actor_user_id AS actorUserId, actor.username AS actorUsername,
    a.owner_user_id AS ownerUserId, target.username AS ownerUsername, a.entity, a.record_id AS recordId,
    a.action, a.before_json AS beforeJson, a.after_json AS afterJson, a.created_at AS createdAt
    FROM admin_audit_log a JOIN users actor ON actor.id=a.actor_user_id JOIN users target ON target.id=a.owner_user_id
    ORDER BY a.created_at DESC, a.id DESC LIMIT ?`).bind(limit).all();
  return c.json({ events: result.results });
});
