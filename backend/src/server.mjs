// server.mjs — Aelix public backend entry point.
import { createServer } from 'node:http'
import { config, printBootWarnings } from './config.mjs'
import { createRouter } from './lib/http.mjs'
import { createServices } from './services.mjs'
import { registerRoutes } from './routes.mjs'
import { startScheduler } from './desk/scheduler.mjs'

printBootWarnings(console)

const services = createServices(config)
const router = createRouter({ config, store: services.store })
registerRoutes(router, services)

const scheduler = startScheduler({ services, config })

const server = createServer((req, res) => {
  router.handle(req, res).catch((err) => {
    console.error('[fatal]', err)
    if (!res.writableEnded) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'internal error' }))
    }
  })
})

server.listen(config.port, () => {
  console.log(`✔ Aelix backend on http://localhost:${config.port}  ·  broker=${config.brokerMode}  ·  coach=${services.coach.enabled ? 'on' : 'off'}`)
})

function shutdown(sig) {
  console.log(`\n${sig} — shutting down…`)
  scheduler.stop()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export { server, services }
