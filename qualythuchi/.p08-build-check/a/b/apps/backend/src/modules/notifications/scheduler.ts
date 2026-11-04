import { buildPushPayload } from '@block65/webcrypto-web-push';
import { decryptSubscription } from './routes';
import { reminderLocalDate } from './time';

interface OwnerSetting { owner_user_id: string; timezone: string }
interface Delivery { notification_id: string; subscription_id: string; owner_user_id: string; subscription_ciphertext: string; title: string; body: string }

export async function runNotificationSchedule(env: Env, now = new Date()) {
  const owners = await env.DB.prepare(`SELECT s.owner_user_id,s.timezone FROM notification_settings s
    WHERE s.push_enabled=1 AND EXISTS(SELECT 1 FROM push_subscriptions p WHERE p.owner_user_id=s.owner_user_id AND p.disabled_at IS NULL)`).all<OwnerSetting>();
  for (const owner of owners.results) {
    const dateKey = reminderLocalDate(now, owner.timezone);
    if (!dateKey) continue;
    const notificationId = crypto.randomUUID();
    await env.DB.prepare(`INSERT OR IGNORE INTO notifications(id,owner_user_id,kind,dedupe_key,title,body,payload_json,created_at)
      VALUES(?,?,'DAILY_REMINDER',?,'Nhắc bạn ghi chép','Mở ứng dụng để xem và cập nhật hôm nay.','{}',?)`)
      .bind(notificationId, owner.owner_user_id, `daily:${dateKey}`, now.getTime()).run();
    const saved = await env.DB.prepare('SELECT id FROM notifications WHERE owner_user_id=? AND dedupe_key=?')
      .bind(owner.owner_user_id, `daily:${dateKey}`).first<{ id: string }>();
    if (!saved) continue;
    const subscriptions = await env.DB.prepare('SELECT id FROM push_subscriptions WHERE owner_user_id=? AND disabled_at IS NULL')
      .bind(owner.owner_user_id).all<{ id: string }>();
    if (subscriptions.results.length) {
      await env.DB.batch(subscriptions.results.map((subscription) => env.DB.prepare(`INSERT OR IGNORE INTO notification_deliveries
        (notification_id,subscription_id,status,attempts,next_attempt_at,created_at) VALUES(?,?,'PENDING',0,?,?)`)
        .bind(saved.id, subscription.id, now.getTime(), now.getTime())));
    }
  }

  await env.DB.prepare(`UPDATE notification_deliveries SET status='FAILED',locked_until=NULL
    WHERE status='SENDING' AND attempts>=3 AND locked_until<=?`).bind(now.getTime()).run();
  const due = await env.DB.prepare(`SELECT d.notification_id,d.subscription_id,p.owner_user_id,p.subscription_ciphertext,n.title,n.body
    FROM notification_deliveries d JOIN push_subscriptions p ON p.id=d.subscription_id
    JOIN notifications n ON n.id=d.notification_id
    WHERE d.status IN ('PENDING','RETRY','SENDING') AND d.attempts<3 AND d.next_attempt_at<=? AND (d.locked_until IS NULL OR d.locked_until<=?)
      AND p.disabled_at IS NULL ORDER BY d.next_attempt_at LIMIT 50`).bind(now.getTime(), now.getTime()).all<Delivery>();
  for (const item of due.results) {
    const lockUntil = now.getTime() + 60_000;
    const claim = await env.DB.prepare(`UPDATE notification_deliveries SET status='SENDING',locked_until=?,attempts=attempts+1
      WHERE notification_id=? AND subscription_id=? AND status IN ('PENDING','RETRY','SENDING') AND attempts<3 AND (locked_until IS NULL OR locked_until<=?)`)
      .bind(lockUntil, item.notification_id, item.subscription_id, now.getTime()).run();
    if (!claim.meta.changes) continue;
    try {
      if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) throw new Error('Push service is not configured.');
      const subscription = await decryptSubscription(item.subscription_ciphertext, env);
      const payload = await buildPushPayload({ data: { title: item.title, body: item.body, url: '/notifications' }, options: { ttl: 3600, urgency: 'normal' } }, subscription,
        { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });
      const response = await fetch(subscription.endpoint, { ...payload, redirect: 'error' });
      if (response.ok) {
        await env.DB.batch([
          env.DB.prepare(`UPDATE notification_deliveries SET status='SENT',sent_at=?,locked_until=NULL WHERE notification_id=? AND subscription_id=?`)
            .bind(now.getTime(), item.notification_id, item.subscription_id),
          env.DB.prepare('UPDATE push_subscriptions SET last_sent_at=?,updated_at=? WHERE id=?').bind(now.getTime(), now.getTime(), item.subscription_id)
        ]);
      } else if (response.status === 404 || response.status === 410) {
        await env.DB.batch([
          env.DB.prepare(`UPDATE push_subscriptions SET disabled_at=?,updated_at=? WHERE id=?`).bind(now.getTime(), now.getTime(), item.subscription_id),
          env.DB.prepare(`UPDATE notification_deliveries SET status='FAILED',locked_until=NULL WHERE notification_id=? AND subscription_id=?`).bind(item.notification_id, item.subscription_id)
        ]);
      } else {
        await retryOrFail(env, item, now.getTime());
      }
    } catch {
      await retryOrFail(env, item, now.getTime());
    }
  }
}

async function retryOrFail(env: Env, item: Delivery, now: number) {
  await env.DB.prepare(`UPDATE notification_deliveries SET status=CASE WHEN attempts>=3 THEN 'FAILED' ELSE 'RETRY' END,
    next_attempt_at=?,locked_until=NULL WHERE notification_id=? AND subscription_id=? AND status='SENDING'`)
    .bind(now + 5 * 60_000, item.notification_id, item.subscription_id).run();
}
