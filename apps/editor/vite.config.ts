import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

function fullReloadNonCss(): Plugin {
  return {
    name: 'full-reload-non-css',
    handleHotUpdate({ file, server }) {
      if (!file.endsWith('.css')) {
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
  }
}

export default defineConfig({
  resolve: {
    /* Array-form aliases with regex `find` — required for deep imports
       like `@effects/runtime/node-engine/processors/blur`. The
       object-form trailing-slash hack (`'@effects/runtime/': '...'`) is
       only consulted by some Rollup-plugin-alias variants and Vite 8
       silently ignores it for prefix matching, so deep imports fall
       through to npm resolution which then 404s because the package
       has no `./*` exports map. Regex captures handle root + deep
       cases explicitly. */
    alias: [
      { find: /^@effects\/runtime$/,       replacement: path.resolve(REPO_ROOT, 'packages/runtime/src/index.ts') },
      { find: /^@effects\/runtime\/(.*)$/, replacement: path.resolve(REPO_ROOT, 'packages/runtime/src') + '/$1' },
      { find: /^@effects\/ui$/,            replacement: path.resolve(REPO_ROOT, 'packages/ui/src/index.ts') },
      { find: /^@effects\/ui\/(.*)$/,      replacement: path.resolve(REPO_ROOT, 'packages/ui/src') + '/$1' },
      { find: '@',                         replacement: path.resolve(__dirname, './src') },
    ],
  },
  /* Pixi reads its own version banner; ensure both apps share the
     same Pixi instance from the hoisted root node_modules. */
  optimizeDeps: {
    include: ['pixi.js'],
  },
  plugins: [react(), fullReloadNonCss()],
  server: {
    proxy: {
      '/api/dnf': 'http://localhost:8001',
      '/api': 'http://localhost:8000',
    },
  },
})
