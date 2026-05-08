import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

export default defineConfig({
  resolve: {
    // Array-form regex aliases for deep workspace imports; object-form
    // trailing-slash does not work in Vite 8 (see apps/editor/vite.config.ts).
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
  optimizeDeps: {
    include: ['pixi.js'],
  },
  plugins: [react()],
})
