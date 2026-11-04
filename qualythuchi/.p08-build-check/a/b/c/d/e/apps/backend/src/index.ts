import { app } from './app';
import { runNotificationSchedule } from './modules/notifications/scheduler';

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(runNotificationSchedule(env));
  }
};
