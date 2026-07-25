import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import compression from 'vite-plugin-compression'
import { VitePWA } from 'vite-plugin-pwa'

function nonBlockingCss() {
  return {
    name: 'non-blocking-css',
    transformIndexHtml(html) {
      return html.replace(
        /<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]+)"\s*\/?>/g,
        '<link rel="preload" href="$1" as="style" onload="this.onload=null;this.rel=\'stylesheet\'" />\n    <noscript><link rel="stylesheet" href="$1" /></noscript>'
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    compression({ algorithm: 'gzip' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: false, // using static manifest.json in public/
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/posts\?/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'posts-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /\/api\/communities/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'communities-cache' },
          },
        ],
      },
    }),
    nonBlockingCss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tiptap') || id.includes('/prosemirror-')) {
              return 'tiptap'
            }
            if (id.endsWith('/react-dom') || id.endsWith('/react-dom/') || id.includes('/react-dom/') || id.endsWith('/react') || id.endsWith('/react/') || id.includes('/react/jsx') || id.includes('/react/cjs')) {
              return 'react-vendor'
            }
            if (id.includes('/react-router')) {
              return 'router'
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query'
            }
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
  preview: {
    port: 5173,
  },
})
