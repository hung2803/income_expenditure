import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { normalizeApiBaseUrl } from './src/infrastructure/api/url';
import { backendProxyHeaders } from './src/infrastructure/api/proxy-origin';
import { devPwaRecovery } from './dev-pwa-recovery';
import { appManifest } from './pwa-manifest';

export default defineConfig(({ mode }) => {
  // Validate the public backend origin at startup/build, before shipping a bundle.
  const env = loadEnv(mode, process.cwd(), '');
  if (mode !== 'localdev') normalizeApiBaseUrl(env.VITE_API_BASE_URL ?? '');
  const localDev = mode === 'localdev';
  const target = localDev ? 'http://127.0.0.1:8787' : process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787';
  const backend: ProxyOptions = { target, changeOrigin: true, configure(proxy) {
    proxy.on('proxyReq', (proxyRequest, request) => {
      const secure = 'encrypted' in request.socket && request.socket.encrypted === true;
      const headers = backendProxyHeaders(
        request.headers.origin,
        request.headers.host,
        secure,
        target,
        typeof request.headers['x-forwarded-proto'] === 'string' ? request.headers['x-forwarded-proto'] : undefined,
        typeof request.headers['x-forwarded-host'] === 'string' ? request.headers['x-forwarded-host'] : undefined,
        typeof request.headers['cf-ray'] === 'string' && typeof request.headers['cf-connecting-ip'] === 'string'
      );
      proxyRequest.removeHeader('X-Forwarded-Origin');
      proxyRequest.removeHeader('X-Forwarded-Host');
      proxyRequest.removeHeader('X-Forwarded-Proto');
      if (headers.origin) proxyRequest.setHeader('Origin', headers.origin);
      if (headers.forwardedOrigin && headers.forwardedHost) {
        proxyRequest.setHeader('X-Forwarded-Origin', headers.forwardedOrigin);
        proxyRequest.setHeader('X-Forwarded-Host', headers.forwardedHost);
        proxyRequest.setHeader('X-Forwarded-Proto', 'https');
      }
    });
  } };
  const proxy = { '/api': backend, '/auth': backend };
  return {
    ...(localDev ? { define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') } } : {}),
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [devPwaRecovery(), react(), tailwindcss(), VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: appManifest,
      workbox: {
        importScripts: ['/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(?:api|auth)(?:\/|$)/],
        // Cache only the app shell. API responses are never stored by this worker.
        runtimeCaching: []
      }
    })],
    server: { port: 5173, strictPort: true,allowedHosts: ['.trycloudflare.com'], proxy },
    preview: { port: 5173, strictPort: true, allowedHosts: ['.trycloudflare.com'], proxy },
  };
});
