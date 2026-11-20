import tailwindcss from '@tailwindcss/vite';
import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Older browsers (e.g. Chrome on smart TVs): an extra build with polyfills, loaded only
    // where the modern one can't run. Modern browsers are unaffected.
    legacy({
      targets: ['chrome >= 61', 'android >= 61', 'safari >= 12', 'firefox >= 60'],
      // The modern build is used by any browser with ES modules + dynamic import (Chrome 64+),
      // so its syntax must also run there: no ?. or ?? (Chrome 80+).
      modernTargets: ['chrome >= 64', 'edge >= 79', 'safari >= 12', 'firefox >= 67'],
      modernPolyfills: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sodiq Coffee — hisob',
        short_name: 'Sodiq Coffee',
        description: 'Maktab kofe bari uchun savdo, ombor va kassa hisobi',
        lang: 'uz',
        theme_color: '#3b2416',
        background_color: '#faf7f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
