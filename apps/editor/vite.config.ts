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
    /* Array-form aliases with regex `find` are required for deep
       imports like `@effects/runtime/node-engine/processors/blur`:
       Vite 8 ignores the object-form trailing-slash hack for prefix
       matching, so deep imports would 404 (the package has no `./*`
       exports map). Regex captures handle root + deep cases. */
    alias: [
      { find: /^@effects\/runtime$/,       replacement: path.resolve(REPO_ROOT, 'packages/runtime/src/index.ts') },
      { find: /^@effects\/runtime\/(.*)$/, replacement: path.resolve(REPO_ROOT, 'packages/runtime/src') + '/$1' },
      { find: /^@effects\/player$/,        replacement: path.resolve(REPO_ROOT, 'packages/player/src/index.ts') },
      { find: /^@effects\/player\/(.*)$/,  replacement: path.resolve(REPO_ROOT, 'packages/player/src') + '/$1' },
      { find: /^@effects\/ui$/,            replacement: path.resolve(REPO_ROOT, 'packages/ui/src/index.ts') },
      { find: /^@effects\/ui\/(.*)$/,      replacement: path.resolve(REPO_ROOT, 'packages/ui/src') + '/$1' },
      { find: '@',                         replacement: path.resolve(__dirname, './src') },
    ],
  },
  /* Force pre-bundling so both apps share the same Pixi instance from
     the hoisted root node_modules (Pixi reads its own version banner). */
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
