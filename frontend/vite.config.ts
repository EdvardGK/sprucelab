import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // dxf-viewer does `import opentype from "opentype.js"`; opentype.js'
      // ESM build (`.mjs`) only has named exports. Force the CJS entry so
      // Rollup synthesises a default export consistently across Yarn 1 (Vercel)
      // and Yarn 4 PnP (local). Without this, Vercel's Yarn 1 hoist breaks.
      'opentype.js': 'opentype.js/dist/opentype.js',
    },
  },
  optimizeDeps: {
    include: ['dxf-viewer', 'opentype.js'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
