import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import wasm from 'vite-plugin-wasm'
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const req = createRequire(import.meta.url)

function copyWasm(): any {
  return {
    name: 'copy-wasm',
    generateBundle() {
      const wasmPath = req.resolve('oxigraph/web_bg.wasm')
      const source = readFileSync(wasmPath)
      this.emitFile({
        type: 'asset',
        fileName: 'assets/web_bg.wasm',
        source
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    copyWasm(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'StratiGraph — Harris Matrix Generator',
        short_name: 'StratiGraph',
        description: 'A modern, AI-ready Harris Matrix generator for archaeological stratigraphy',
        theme_color: '#0b0e11',
        background_color: '#0b0e11',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  base: process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/',
  optimizeDeps: {
    exclude: ['oxigraph']
  },
  build: {
    target: 'es2022',
    rolldownOptions: {
      external: ['cytoscape-svg'],
      onwarn(warning, warn) {
        if (warning.code === 'UNRESOLVED_IMPORT' && warning.exporter === 'cytoscape-svg') return;
        warn(warning);
      },
    },
  },
})
