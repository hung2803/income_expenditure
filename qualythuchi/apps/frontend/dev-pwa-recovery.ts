import type { Plugin } from 'vite';
import { appManifest } from './pwa-manifest';

// Dev used to return index.html for /sw.js, preventing an installed production
// worker from updating. Retire it on its next check without reloading open forms.
const retireWorker = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.registration.unregister()));
`;

const recoveryPage = `<!doctype html><html lang="vi"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mở giao diện mới</title><body>
<p id="status">Đang mở giao diện mới… Dữ liệu trên thiết bị được giữ nguyên.</p>
<script>
(async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(registration => {
        const scope = new URL(registration.scope);
        return scope.origin === location.origin && scope.pathname === '/';
      }).map(registration => registration.unregister()));
    }
    location.replace('/dashboard');
  } catch {
    document.getElementById('status').textContent = 'Chưa mở được giao diện mới. Kiểm tra mạng rồi tải lại trang này.';
  }
})();
</script></body></html>`;

export function devPwaRecovery(): Plugin {
  return {
    name: 'local-pwa-recovery',
    apply: 'serve',
    transformIndexHtml() {
      return [{ tag: 'link', attrs: { rel: 'manifest', href: '/manifest.webmanifest' }, injectTo: 'head' }];
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        if (request.method !== 'GET' || !['/sw.js', '/auth/dev-refresh', '/manifest.webmanifest'].includes(path ?? '')) return next();
        response.setHeader('Cache-Control', 'no-store');
        if (path === '/manifest.webmanifest') {
          response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          response.end(JSON.stringify(appManifest));
          return;
        }
        response.setHeader('Content-Type', path === '/sw.js' ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8');
        if (path === '/sw.js') response.setHeader('Service-Worker-Allowed', '/');
        // /auth is excluded by the previous Workbox navigation fallback, so
        // even a stale app shell can reach this page. No storage/cache clearing.
        response.end(path === '/sw.js' ? retireWorker : recoveryPage);
      });
    }
  };
}
