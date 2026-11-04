import { Hono } from 'hono';
import type { AuthEnvironment } from '../../middleware/auth';
import { requireAuth, requireCsrf, scopeOwner } from '../../middleware/auth';
import { AuthError } from '../auth/errors';
import { jsonBody } from '../auth/validation';
import { recordAdminFinanceChange } from '../users/audit';

export const savingsRecurringRoutes = new Hono<AuthEnvironment>();
const goalsPath = '/users/:ownerUserId/savings-goals';
const goalPath = `${goalsPath}/:goalId`;
const contributionPath = `${goalPath}/contributions`;
const schedulesPath = '/users/:ownerUserId/recurring-schedules';
const schedulePath = `${schedulesPath}/:scheduleId`;
const confirmPath = `${schedulePath}/confirm`;
const invalid = () => new AuthError(400, 'INVALID_INPUT', 'Dữ liệu tiết kiệm hoặc định kỳ không hợp lệ.');
const scheduleSelect = `SELECT s.id,s.owner_user_id AS ownerUserId,s.name,s.type,s.amount,s.wallet_id AS walletId,s.category_id AS categoryId,c.name AS categoryName,w.name AS walletName,s.cadence,s.interval_count AS intervalCount,s.day_of_month AS dayOfMonth,s.start_date AS startDate,s.next_due_date AS nextDueDate,s.timezone,s.note,s.is_active AS isActive,s.revision,s.created_at AS createdAt,s.updated_at AS updatedAt FROM recurring_schedules s JOIN categories c ON c.owner_user_id=s.owner_user_id AND c.id=s.category_id JOIN wallets w ON w.owner_user_id=s.owner_user_id AND w.id=s.wallet_id`;
const text = (v: unknown, max: number, optional = false) => {
  if (optional && v === undefined) return '';
  if (typeof v !== 'string' || v.trim().length > max || (!optional && !v.trim()) || Array.from(v).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw invalid();
  return v.trim();
};
const amount = (v: unknown) => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) throw invalid();
  return v;
};
const isoDate = (v: unknown, nullable = false) => {
  if (nullable && (v === null || v === '')) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw invalid();
  return v;
};
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function allowKeys(body: Record<string, unknown>, keys: string[]) { if (Object.keys(body).some((key) => !keys.includes(key))) throw invalid(); }
function parseGoal(value: unknown) {
  const body = obj(value); allowKeys(body, ['name', 'description', 'targetAmount', 'dueDate']);
  return { name: text(body.name, 80), description: text(body.description ?? '', 200, true), targetAmount: amount(body.targetAmount), dueDate: isoDate(body.dueDate, true) };
}
function parseSchedule(value: unknown) {
  const body = obj(value); allowKeys(body, ['name', 'type', 'amount', 'walletId', 'categoryId', 'cadence', 'intervalCount', 'dayOfMonth', 'startDate', 'timezone', 'note']);
  if (body.type !== 'EXPENSE' && body.type !== 'INCOME') throw invalid();
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(String(body.cadence))) throw invalid();
  const intervalCount = body.intervalCount === undefined ? 1 : body.intervalCount;
  if (typeof intervalCount !== 'number' || !Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 99) throw invalid();
  const dayOfMonth = body.dayOfMonth === undefined ? null : body.dayOfMonth;
  if (dayOfMonth !== null && (typeof dayOfMonth !== 'number' || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) throw invalid();
  const timezone = body.timezone === undefined ? 'Asia/Bangkok' : text(body.timezone, 64);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw invalid(); }
  const startDate = isoDate(body.startDate)!;
  return { name: text(body.name, 80), type: body.type, amount: amount(body.amount), walletId: text(body.walletId, 128), categoryId: text(body.categoryId, 128), cadence: body.cadence as string, intervalCount, dayOfMonth: dayOfMonth as number | null, startDate, timezone, note: text(body.note ?? '', 200, true) };
}
function confirmedTransaction(row:Record<string,unknown>) {
  const timestamp=(value:unknown)=>typeof value==='number'?new Date(value).toISOString():value;
  return { id:row.id,ownerUserId:row.ownerUserId,walletId:row.walletId,categoryId:row.categoryId,type:row.type,amount:row.amount,
    occurredAt:timestamp(row.occurredAt),note:row.note,tags:row.tags??(typeof row.tagsJson==='string'?JSON.parse(row.tagsJson) as unknown:[]),
    createdAt:timestamp(row.createdAt),updatedAt:timestamp(row.updatedAt),deletedAt:row.deletedAt===null?null:timestamp(row.deletedAt),revision:row.revision };
}

const goalSelect = `SELECT g.id,g.owner_user_id AS ownerUserId,g.name,g.description,g.target_amount AS targetAmount,g.due_date AS dueDate,g.status,g.revision,g.created_at AS createdAt,g.updated_at AS updatedAt,COALESCE(SUM(c.amount),0) AS savedAmount FROM savings_goals g LEFT JOIN savings_contributions c ON c.owner_user_id=g.owner_user_id AND c.goal_id=g.id`;
savingsRecurringRoutes.get(goalsPath, requireAuth, scopeOwner, async (c) => {
  const owner = c.get('ownerUserId');
  const rows = await c.env.DB.prepare(`${goalSelect} WHERE g.owner_user_id=? GROUP BY g.id ORDER BY CASE g.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,g.due_date,g.created_at DESC`).bind(owner).all<Record<string, unknown>>();
  return c.json({ goals: rows.results.map((row) => ({ ...row, progressPercent: Math.min(100, Math.floor(Number(row.savedAmount) * 100 / Number(row.targetAmount))) })) });
});
savingsRecurringRoutes.post(goalsPath, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const owner = c.get('ownerUserId'); const input = parseGoal(await jsonBody(c.req.raw)); const id = crypto.randomUUID(); const now = Date.now();
  await c.env.DB.prepare(`INSERT INTO savings_goals(id,owner_user_id,name,description,target_amount,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id, owner, input.name, input.description, input.targetAmount, input.dueDate, now, now).run();
  const goal = await c.env.DB.prepare(`${goalSelect} WHERE g.owner_user_id=? AND g.id=? GROUP BY g.id`).bind(owner, id).first<Record<string, unknown>>();
  await recordAdminFinanceChange(c.env.DB, c.get('auth').dto.user, owner, 'savings_goal', id, 'CREATE', goal);
  return c.json({ goal: { ...goal, progressPercent: 0 } }, 201);
});
savingsRecurringRoutes.put(goalPath, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const owner = c.get('ownerUserId'); const id = c.req.param('goalId'); const input = parseGoal(await jsonBody(c.req.raw)); const now = Date.now();
  const changed = await c.env.DB.prepare(`UPDATE savings_goals SET name=?,description=?,target_amount=?,due_date=?,revision=revision+1,updated_at=? WHERE owner_user_id=? AND id=?`).bind(input.name,input.description,input.targetAmount,input.dueDate,now,owner,id).run();
  if (!changed.meta.changes) throw new AuthError(404, 'NOT_FOUND', 'Không tìm thấy mục tiêu tiết kiệm.');
  const goal = await c.env.DB.prepare(`${goalSelect} WHERE g.owner_user_id=? AND g.id=? GROUP BY g.id`).bind(owner,id).first<Record<string, unknown>>();
  await recordAdminFinanceChange(c.env.DB,c.get('auth').dto.user,owner,'savings_goal',id,'UPDATE',goal);
  return c.json({ goal: { ...goal, progressPercent: Math.min(100,Math.floor(Number(goal!.savedAmount)*100/Number(goal!.targetAmount))) } });
});
savingsRecurringRoutes.delete(goalPath, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const owner = c.get('ownerUserId'); const id = c.req.param('goalId');
  const before = await c.env.DB.prepare(`${goalSelect} WHERE g.owner_user_id=? AND g.id=? GROUP BY g.id`).bind(owner,id).first<Record<string, unknown>>();
  if (!before) throw new AuthError(404,'NOT_FOUND','Không tìm thấy mục tiêu tiết kiệm.');
  await c.env.DB.prepare('DELETE FROM savings_goals WHERE owner_user_id=? AND id=?').bind(owner,id).run();
  await recordAdminFinanceChange(c.env.DB,c.get('auth').dto.user,owner,'savings_goal',id,'DELETE',before);
  return c.body(null,204);
});
savingsRecurringRoutes.get(contributionPath, requireAuth, scopeOwner, async (c) => {
  const result = await c.env.DB.prepare(`SELECT id,owner_user_id AS ownerUserId,goal_id AS goalId,amount,contributed_at AS contributedAt,note,created_at AS createdAt FROM savings_contributions WHERE owner_user_id=? AND goal_id=? ORDER BY contributed_at DESC,id DESC`).bind(c.get('ownerUserId'),c.req.param('goalId')).all();
  return c.json({ contributions: result.results });
});
savingsRecurringRoutes.post(contributionPath, requireAuth, scopeOwner, requireCsrf, async (c) => {
  const body=obj(await jsonBody(c.req.raw)); allowKeys(body,['id','amount','contributedAt','note']);
  const id = body.id === undefined ? crypto.randomUUID() : text(body.id,128); const owner=c.get('ownerUserId'); const goalId=c.req.param('goalId'); const sum=amount(body.amount); const timestamp=body.contributedAt === undefined ? Date.now() : Date.parse(text(body.contributedAt,40));
  if (!Number.isSafeInteger(timestamp)) throw invalid(); const note=text(body.note ?? '',200,true); const now=Date.now();
  const goal=await c.env.DB.prepare('SELECT id FROM savings_goals WHERE owner_user_id=? AND id=?').bind(owner,goalId).first(); if(!goal) throw new AuthError(404,'NOT_FOUND','Không tìm thấy mục tiêu tiết kiệm.');
  await c.env.DB.prepare('INSERT INTO savings_contributions(id,owner_user_id,goal_id,amount,contributed_at,note,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,owner,goalId,sum,timestamp,note,now).run();
  const contribution={id,ownerUserId:owner,goalId,amount:sum,contributedAt:timestamp,note,createdAt:now};
  await recordAdminFinanceChange(c.env.DB,c.get('auth').dto.user,owner,'savings_contribution',id,'CREATE',contribution);
  return c.json({ contribution },201);
});

savingsRecurringRoutes.get(schedulesPath, requireAuth, scopeOwner, async(c)=>{
  const result=await c.env.DB.prepare(`${scheduleSelect} WHERE s.owner_user_id=? ORDER BY s.is_active DESC,s.next_due_date`).bind(c.get('ownerUserId')).all();
  return c.json({ schedules:result.results });
});
savingsRecurringRoutes.post(schedulesPath, requireAuth, scopeOwner, requireCsrf, async(c)=>{
  const owner=c.get('ownerUserId'); const input=parseSchedule(await jsonBody(c.req.raw)); const check=await c.env.DB.prepare(`SELECT w.id FROM wallets w JOIN categories k ON k.owner_user_id=w.owner_user_id WHERE w.owner_user_id=? AND w.id=? AND k.id=? AND k.type=?`).bind(owner,input.walletId,input.categoryId,input.type).first();
  if(!check) throw new AuthError(400,'INVALID_INPUT','Ví và danh mục phải thuộc cùng tài khoản và đúng loại giao dịch.');
  const id=crypto.randomUUID(); const now=Date.now(); const due=input.startDate;
  await c.env.DB.prepare(`INSERT INTO recurring_schedules(id,owner_user_id,name,type,amount,wallet_id,category_id,cadence,interval_count,day_of_month,start_date,next_due_date,timezone,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,owner,input.name,input.type,input.amount,input.walletId,input.categoryId,input.cadence,input.intervalCount,input.dayOfMonth,input.startDate,due,input.timezone,input.note,now,now).run();
  const schedule=await c.env.DB.prepare(`${scheduleSelect} WHERE s.owner_user_id=? AND s.id=?`).bind(owner,id).first();
  await recordAdminFinanceChange(c.env.DB,c.get('auth').dto.user,owner,'recurring_schedule',id,'CREATE',schedule);
  return c.json({schedule},201);
});
savingsRecurringRoutes.patch(schedulePath, requireAuth, scopeOwner, requireCsrf, async(c)=>{
  const body=obj(await jsonBody(c.req.raw)); allowKeys(body,['isActive']); if(typeof body.isActive!=='boolean') throw invalid();
  const owner=c.get('ownerUserId'); const id=c.req.param('scheduleId'); const changed=await c.env.DB.prepare('UPDATE recurring_schedules SET is_active=?,revision=revision+1,updated_at=? WHERE owner_user_id=? AND id=?').bind(body.isActive?1:0,Date.now(),owner,id).run();
  if(!changed.meta.changes) throw new AuthError(404,'NOT_FOUND','Không tìm thấy khoản định kỳ.');
  const schedule=await c.env.DB.prepare(`${scheduleSelect} WHERE s.owner_user_id=? AND s.id=?`).bind(owner,id).first();
  await recordAdminFinanceChange(c.env.DB,c.get('auth').dto.user,owner,'recurring_schedule',id,'UPDATE',schedule);
  return c.json({schedule});
});
savingsRecurringRoutes.delete(schedulePath, requireAuth, scopeOwner, requireCsrf, async(c)=>{
  const owner=c.get('ownerUserId');const id=c.req.param('scheduleId');const before=await c.env.DB.prepare('SELECT * FROM recurring_schedules WHERE owner_user_id=? AND id=?').bind(owner,id).first();
  if(!before) throw new AuthError(404,'NOT_FOUND','Không tìm thấy khoản định kỳ.');
  await c.env.DB.prepare('DELETE FROM recurring_schedules WHERE owner_user_id=? AND id=?').bind(owner,id).run();
  await recordAdminFinanceChange(c.env.DB,c.get('auth').dto.user,owner,'recurring_schedule',id,'DELETE',before);
  return c.body(null,204);
});
savingsRecurringRoutes.post(confirmPath, requireAuth, scopeOwner, requireCsrf, async(c)=>{
  const body=obj(await jsonBody(c.req.raw)); allowKeys(body,['dueDate']);const due=isoDate(body.dueDate)!;const owner=c.get('ownerUserId');const id=c.req.param('scheduleId');
  const prior=await c.env.DB.prepare(`SELECT t.id,t.owner_user_id AS ownerUserId,t.wallet_id AS walletId,t.category_id AS categoryId,t.type,t.amount,t.occurred_at AS occurredAt,t.note,t.tags_json AS tagsJson,t.created_at AS createdAt,t.updated_at AS updatedAt,t.deleted_at AS deletedAt,t.revision FROM recurring_confirmations x JOIN transactions t ON t.id=x.transaction_id WHERE x.owner_user_id=? AND x.schedule_id=? AND x.due_date=?`).bind(owner,id,due).first<Record<string,unknown>>();
  if(prior) return c.json({transaction:confirmedTransaction(prior),duplicate:true});
  const schedule=await c.env.DB.prepare('SELECT * FROM recurring_schedules WHERE owner_user_id=? AND id=? AND is_active=1').bind(owner,id).first<Record<string,unknown>>();
  if(!schedule) throw new AuthError(404,'NOT_FOUND','Khoản định kỳ không tồn tại hoặc đang tạm dừng.');
  if(schedule.next_due_date!==due) throw new AuthError(409,'DUE_DATE_MISMATCH','Kỳ này đã được xử lý hoặc chưa đến hạn.');
  const createdAt=Date.now();const transactionId=crypto.randomUUID(); const occurredAt=Date.parse(`${due}T12:00:00Z`);
  const next=nextDueDate(due,String(schedule.cadence),Number(schedule.interval_count),Number(schedule.day_of_month)||Number(due.slice(-2)));
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO transactions(id,owner_user_id,wallet_id,category_id,type,amount,occurred_at,note,tags_json,created_at,updated_at,revision) VALUES(?,?,?,?,?,?,?,?, '[]',?,?,1)`).bind(transactionId,owner,schedule.wallet_id,schedule.category_id,schedule.type,schedule.amount,occurredAt,schedule.note,createdAt,createdAt),
      c.env.DB.prepare('INSERT INTO recurring_confirmations(owner_user_id,schedule_id,due_date,transaction_id,confirmed_at) VALUES(?,?,?,?,?)').bind(owner,id,due,transactionId,createdAt),
      c.env.DB.prepare('UPDATE recurring_schedules SET next_due_date=?,revision=revision+1,updated_at=? WHERE owner_user_id=? AND id=? AND next_due_date=?').bind(next,createdAt,owner,id,due)
    ]);
  } catch(error) {
    const duplicated=await c.env.DB.prepare(`SELECT t.id,t.owner_user_id AS ownerUserId,t.wallet_id AS walletId,t.category_id AS categoryId,t.type,t.amount,t.occurred_at AS occurredAt,t.note,t.tags_json AS tagsJson,t.created_at AS createdAt,t.updated_at AS updatedAt,t.deleted_at AS deletedAt,t.revision FROM recurring_confirmations x JOIN transactions t ON t.id=x.transaction_id WHERE x.owner_user_id=? AND x.schedule_id=? AND x.due_date=?`).bind(owner,id,due).first<Record<string,unknown>>();
    if(duplicated) return c.json({transaction:confirmedTransaction(duplicated),duplicate:true});
    throw error;
  }
  const transaction=confirmedTransaction({id:transactionId,ownerUserId:owner,walletId:schedule.wallet_id,categoryId:schedule.category_id,type:schedule.type,amount:schedule.amount,occurredAt,note:schedule.note,tags:[],createdAt,updatedAt:createdAt,deletedAt:null,revision:1});
  await recordAdminFinanceChange(c.env.DB,c.get('auth').dto.user,owner,'transaction',transactionId,'CREATE',transaction);
  return c.json({transaction,duplicate:false},201);
});

function nextDueDate(date:string,cadence:string,interval:number,day:number):string {
  const [y,m,d]=date.split('-').map(Number); const current=new Date(Date.UTC(y!,m!-1,d!));
  if(cadence==='DAILY') current.setUTCDate(current.getUTCDate()+interval);
  else if(cadence==='WEEKLY') current.setUTCDate(current.getUTCDate()+7*interval);
  else { current.setUTCDate(1);current.setUTCMonth(current.getUTCMonth()+interval);const last=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+1,0)).getUTCDate();current.setUTCDate(Math.min(day,last)); }
  return current.toISOString().slice(0,10);
}
