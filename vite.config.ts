import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react(), fullReloadNonCss()],
  server: {
    proxy: {
      '/api/dnf': 'http://localhost:8001',
      '/api': 'http://localhost:8000',
    },
  },
})
