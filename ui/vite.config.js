import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Control file at the repo root — the PM's /loop watches it; the button writes it.
const REQUEST_FILE = resolve(__dirname, '..', 'desk-request.json')

// Dev-only bridge: lets the dashboard's "Run desk" button drop a request the PM consumes.
// It NEVER runs the LLM or places orders itself — it only writes/reads a JSON file.
function deskTriggerPlugin() {
  return {
    name: 'desk-trigger',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/vault' || req.url === '/vault/') {
          req.url = '/vault.html'
        }
        if (req.url === '/api/run' && req.method === 'POST') {
          let body = ''
          req.on('data', (c) => (body += c))
          req.on('end', async () => {
            let params = {}
            try { params = body ? JSON.parse(body) : {} } catch { params = {} }
            const id = `req-${Date.now()}`
            const request = {
              id,
              requestedAt: new Date().toISOString(),
              action: 'run-desk',
              params: { tickers: params.tickers || [], note: params.note || '' },
              status: 'pending',
              processedAt: null,
            }
            await writeFile(REQUEST_FILE, JSON.stringify(request, null, 2))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, id }))
          })
          return
        }
        if (req.url === '/api/run-status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          readFile(REQUEST_FILE, 'utf8')
            .then((txt) => res.end(txt))
            .catch(() => res.end(JSON.stringify({ status: 'idle' })))
          return
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/vault' || req.url === '/vault/') req.url = '/vault.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), deskTriggerPlugin()],
  server: { port: 5180, open: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        vault: resolve(__dirname, 'vault.html'),
      },
    },
  },
})
