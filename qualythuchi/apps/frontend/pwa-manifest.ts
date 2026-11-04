import type { ManifestOptions } from 'vite-plugin-pwa';

// Use the same app identity/scope in dev and production, without enabling a
// caching service worker on the dev server.
export const appManifest: Partial<ManifestOptions> = {
  id: '/',
  name: 'Quản lý thu chi',
  short_name: 'Thu Chi',
  lang: 'vi',
  start_url: '/',
  scope: '/',
  description: 'Ghi chép và theo dõi thu chi cá nhân.',
  display: 'standalone',
  theme_color: '#237bff',
  background_color: '#f8fafc',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};
