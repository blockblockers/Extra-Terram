// Extra Terram — vite.config.ts v0.12.0 — sound: effects precached, music loaded and cached on first play like the strips
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // stills, effects and icons are precached through globPatterns below; strips are not (see runtimeCaching)
      includeAssets: ['favicon.ico', 'icons/*.png', 'maps/*.jpg', 'art/*.jpg', 'art/worlds/!(*-frames).webp', 'ui/*.png', 'sprites/manifest.json', 'sprites/mounts.json', 'audio/manifest.json', 'audio/sfx/*.{ogg,m4a,mp3}'],
      manifest: {
        name: 'Extra-Terram: The Alien Race Tower Defense',
        short_name: 'Extra-Terram',
        description: 'Pick a race, defend your maze.',
        theme_color: '#07131a',
        background_color: '#07131a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png?v=4', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png?v=4', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png?v=4', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Single-player must work offline: precache the app shell, content JSON and map art.
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,json,woff2,ico,ogg,m4a,mp3}'],
        // animation strips are most of the art's weight: they load when the game first shows them and are
        // cached then (the stills carry the game until they arrive, offline included); old PNG map
        // placeholders, should any be left in public/maps, are never cached (the maps are JPEGs)
        globIgnores: ['**/sprites/**/*-idle.png', '**/sprites/**/*-fire.png', '**/sprites/**/*-walk.png', '**/sprites/**/*-die.png', '**/maps/*.png', '**/audio/music/**', '**/art/worlds/*-frames.webp'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/sprites/') && /-(idle|fire|walk|die)\.png$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'sprite-strips', expiration: { maxEntries: 500 } },
          },
          {
            // the world intros' full-resolution animation strips (1-2 MB a world): the still is precached and carries the intro
            // until the frames arrive; after the first showing they are cached
            urlPattern: ({ url }) => url.pathname.startsWith('/art/worlds/') && url.pathname.endsWith('-frames.webp'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'world-intros-v024-fullres', expiration: { maxEntries: 8 } },
          },
          {
            // music is the heaviest thing in the game: it loads when a scene first asks for it and stays cached
            urlPattern: ({ url }) => url.pathname.startsWith('/audio/music/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'music', expiration: { maxEntries: 32 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true, port: 5173 },
  build: { target: 'es2022', sourcemap: false },
});
