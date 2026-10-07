import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolveBuildSha } from './src/deploy/build-sha.js'
import { socialImageOrigin } from './src/deploy/harden.js'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Staging/prod bake via GITHUB_SHA (GHA); branch previews via CF_PAGES_COMMIT_SHA.
const buildSha = resolveBuildSha(process.env, () =>
  execSync('git rev-parse --short=7 HEAD', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
)

export default defineConfig({
  define: {
    __HIATO_BUILD_SHA__: JSON.stringify(buildSha),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'hiato-social-origin',
      transformIndexHtml(html) {
        const origin = socialImageOrigin({
          pagesUrl: process.env.CF_PAGES_URL,
          branch: process.env.CF_PAGES_BRANCH,
        })
        return html.replaceAll('%HIATO_ORIGIN%', origin)
      },
    },
    VitePWA({
      registerType: 'prompt',
      // Precache favicon, brand SVG, self-hosted fonts, and PNG icons
      includeAssets: [
        'favicon.svg',
        'favicon.ico',
        'favicon-32.png',
        'hiato.svg',
        'brand/*',
        'fonts/*.woff2',
        'fonts/LICENSE.txt',
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
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Include woff2 so offline shell does not depend on CDN fonts
        // JSON packs are runtime-cached (ADR 0006), not precached.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest,txt}'],
        // Crawlers fetch this; the installed PWA does not need it offline.
        globIgnores: ['**/node_modules/**/*', 'sw.js', 'workbox-*.js', '**/og-banner.png'],
        navigateFallback: 'index.html',
        // NavigationRoute would otherwise serve index.html for /og-banner.png
        // (and other static files) when the tab is a document navigation.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/packs\//,
          /^\/og-banner\.png/,
          /\/[^/?]+\.[^/]+$/,
        ],
        runtimeCaching: [
          {
            // Literal must match PACK_ASSET_PATH_RE / PACK_CEFR_LEVELS (Workbox serializes this fn).
            urlPattern: ({ url }) =>
              /\/packs\/(en|de|es|pt)\/(a1|a2|b1|b2|c1|c2)\.json$/.test(
                url.pathname,
              ),
            // NetworkFirst so load.ts version checks see fresh packs under SW.
            // Cache fallback if offline or the network exceeds ~3s.
            handler: 'NetworkFirst',
            options: {
              cacheName: 'hiato-packs', // keep in sync with PACK_SW_CACHE
              networkTimeoutSeconds: 3,
              expiration: {
                // 4 langs × 6 CEFR; LRU is best-effort (not a hard cap of 6).
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              plugins: [
                {
                  cacheWillUpdate: async ({ response }) => {
                    if (!response || response.status !== 200) return null
                    const ct = response.headers.get('content-type') ?? ''
                    if (!ct.includes('application/json')) return null
                    return response
                  },
                },
              ],
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
