import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Serve /vault as the vault dApp entry (vault.html) in dev + preview. The dashboard
// is a read-only mirror — RunControls only copies a prompt to the clipboard, so there
// is no server-side run bridge.
function vaultRoutePlugin() {
  const rewrite = (server) => {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/vault' || req.url === '/vault/') req.url = '/vault.html'
      next()
    })
  }
  return {
    name: 'vault-route',
    configureServer: rewrite,
    configurePreviewServer: rewrite,
  }
}

export default defineConfig(({ command }) => ({
  // Dev runs standalone at the root of :5180. The production build is served
  // under /app on the landing site (Next rewrites /vault + /desk to it), so all
  // asset + data URLs must resolve under /app/ there.
  base: command === 'build' ? '/app/' : '/',
  plugins: [react(), vaultRoutePlugin()],
  server: { port: 5180, open: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        vault: resolve(__dirname, 'vault.html'),
      },
    },
  },
}))
