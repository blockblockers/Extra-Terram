// Extra Terram — vite.config.ts v0.7.0 — key art (jpg) joins the precache
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'maps/*.png', 'art/*.jpg', 'sprites/**/*.png', 'sprites/manifest.json'],
      manifest: {
        name: 'Extra Terram: The Alien Race Tower Defense',
        short_name: 'Extra Terram',
        description: 'Pick a race, defend your maze.',
        theme_color: '#07131a',
        background_color: '#07131a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Single-player must work offline: precache the app shell, content JSON and map art.
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,json,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true, port: 5173 },
  build: { target: 'es2022', sourcemap: false },
});
