import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sqliteD1 } from './sqlite-d1.mjs';
import { app } from '../src/app.ts';
import { csrfForSession, hashToken } from '../src/modules/auth/tokens.ts';
import { runNotificationSchedule } from '../src/modules/notifications/scheduler.ts';

const ORIGIN='https://app.example.test';
function fixture(){
  const database=sqliteD1();const now=Date.now();const sessions=new Map();
  for(const id of ['user-a','user-b']){
    database.sql.prepare(`INSERT INTO users(id,username,display_name,role,password_hash,created_at,updated_at) VALUES(?,?,?,'USER','test-hash',?,?)`).run(id,id,id,now,now);
    const token=randomBytes(32).toString('base64url');database.sql.prepare('INSERT INTO sessions(token_hash,user_id,auth_version,created_at,expires_at) VALUES(?,?,1,?,?)').run(hashToken(token),id,now,now+86400000);sessions.set(id,{token,csrf:csrfForSession(token)});
  }
  for(const id of ['user-a','user-b']){
    database.sql.prepare(`INSERT INTO wallets(id,owner_user_id,name,normalized_name,type,opening_balance,created_at,updated_at) VALUES(?,?,'Cash','cash','CASH',0,?,?)`).run(`wallet-${id}`,id,now,now);
    database.sql.prepare(`INSERT INTO categories(id,owner_user_id,type,name,normalized_name,created_at,updated_at) VALUES(?,?,'EXPENSE','Home','home',?,?)`).run(`expense-${id}`,id,now,now);
  }
  return {...database,sessions,env:{DB:database.db,APP_ENV:'prod',CORS_ORIGINS:ORIGIN}};
}
async function request(f,userId,path,{method='GET',body,csrf=false}={}){
  const session=f.sessions.get(userId);return app.fetch(new Request(`${ORIGIN}${path}`,{method,headers:{Origin:ORIGIN,Cookie:`__Host-thu_chi_session=${session.token}`,...(body===undefined?{}:{'Content-Type':'application/json'}),...(csrf?{'X-CSRF-Token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env);
}

test('savings goals calculate progress, issue milestone alerts once, and stay owner scoped',async()=>{
 const f=fixture();try{
  const create=await request(f,'user-a','/api/users/user-a/savings-goals',{method:'POST',csrf:true,body:{name:'Laptop',description:'Work',targetAmount:10000,dueDate:'2026-12-31'}});
  assert.equal(create.status,201);const goal=(await create.json()).goal;
  assert.equal((await request(f,'user-b','/api/users/user-a/savings-goals')).status,403);
  const add=()=>request(f,'user-a',`/api/users/user-a/savings-goals/${goal.id}/contributions`,{method:'POST',csrf:true,body:{amount:2500,note:'Saved'}});
  assert.equal((await add()).status,201);assert.equal((await add()).status,201);
  const list=await request(f,'user-a','/api/users/user-a/savings-goals');const result=(await list.json()).goals[0];
  assert.equal(result.savedAmount,5000);assert.equal(result.progressPercent,50);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id='user-a' AND dedupe_key LIKE 'savings:%'").get().count,2);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM sync_changes WHERE owner_user_id='user-a' AND entity='savings_contribution'").get().count,2);
 }finally{f.close();}
});

test('recurring payments are not posted until confirmed and repeated confirmation is idempotent',async()=>{
 const f=fixture();try{
  const created=await request(f,'user-a','/api/users/user-a/recurring-schedules',{method:'POST',csrf:true,body:{name:'Rent',type:'EXPENSE',amount:3000000,walletId:'wallet-user-a',categoryId:'expense-user-a',cadence:'MONTHLY',intervalCount:1,dayOfMonth:23,startDate:'2026-10-23',timezone:'Asia/Bangkok',note:'Rent'}});
  assert.equal(created.status,201);const schedule=(await created.json()).schedule;
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM transactions WHERE owner_user_id='user-a'").get().count,0);
  assert.equal((await request(f,'user-b',`/api/users/user-a/recurring-schedules/${schedule.id}/confirm`,{method:'POST',csrf:true,body:{dueDate:'2026-10-23'}})).status,403);
  const path=`/api/users/user-a/recurring-schedules/${schedule.id}/confirm`;
  const first=await request(f,'user-a',path,{method:'POST',csrf:true,body:{dueDate:'2026-10-23'}});assert.equal(first.status,201);assert.equal((await first.json()).duplicate,false);
  const second=await request(f,'user-a',path,{method:'POST',csrf:true,body:{dueDate:'2026-10-23'}});assert.equal(second.status,200);assert.equal((await second.json()).duplicate,true);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM transactions WHERE owner_user_id='user-a'").get().count,1);
  assert.equal(f.sql.prepare('SELECT next_due_date FROM recurring_schedules WHERE id=?').get(schedule.id).next_due_date,'2026-11-23');
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM sync_changes WHERE owner_user_id='user-a' AND entity='recurring_schedule'").get().count,2);
  f.sql.prepare('UPDATE recurring_schedules SET next_due_date=\'2026-10-24\' WHERE id=?').run(schedule.id);
  await runNotificationSchedule(f.env,new Date('2026-10-23T14:00:00.000Z'));
  await runNotificationSchedule(f.env,new Date('2026-10-23T14:15:00.000Z'));
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS count FROM notifications WHERE owner_user_id='user-a' AND dedupe_key LIKE 'recurring:%'").get().count,1);
 }finally{f.close();}
});
