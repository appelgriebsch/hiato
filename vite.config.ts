import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // Precache favicon, brand SVG, self-hosted fonts, and PNG/SVG icons
      includeAssets: [
        'favicon.svg',
        'hiato.svg',
        'fonts/*.woff2',
        'icons/*',
        // Packs are NOT precached at install (ADR 0006) — selected language
        // is cached at runtime; other langs fetch on demand.
      ],
      manifest: {
        name: 'Hiato',
        short_name: 'Hiato',
        description: 'Mobile-first offline language word-guess PWA',
        theme_color: '#f7f6f3',
        background_color: '#f7f6f3',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        // Include woff2 so offline shell does not depend on CDN fonts
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /\/packs\/(en|de|es|pt)\/(a1|a2|b1)\.json$/.test(url.pathname),
            // NetworkFirst so load.ts version checks see fresh packs under SW.
            // Cache fallback if offline or the network exceeds ~3s.
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hiato-packs', // keep in sync with PACK_SW_CACHE
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
})
