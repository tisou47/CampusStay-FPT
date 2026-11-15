// The gate in front of a developer's Ollama when production's AI assistant uses it (ADR-28): Ollama has no
// authentication, so the tunnel reaches this proxy, never Ollama itself. It lets through only what the backend's
// OllamaAssistantModel calls (POST /api/chat) and GET /api/tags for checks, and only with
// "Authorization: Bearer <OLLAMA_PROXY_KEY>" (the server's ASSISTANT_API_KEY). Started by start-assistant.ps1.
//
//   OLLAMA_PROXY_KEY=<key> node infra/assistant/ollama-proxy.mjs
//   optional: PROXY_PORT (8081), OLLAMA_URL (http://127.0.0.1:11434)

import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'

const key = process.env.OLLAMA_PROXY_KEY ?? ''
if (key.length < 32) {
  console.error('Set OLLAMA_PROXY_KEY to a random key of at least 32 characters.')
  process.exit(1)
}
const port = Number(process.env.PROXY_PORT ?? 8081)
const target = new URL(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434')
const expected = Buffer.from(`Bearer ${key}`)
const ALLOWED = new Set(['POST /api/chat', 'GET /api/tags'])
const MAX_BODY = 2 * 1024 * 1024 // the backend sends the guide and one student's data: far below this

const authorized = (header) => {
  const given = Buffer.from(header ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const send = (res, status, message) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: message }))
}

const server = http.createServer((req, res) => {
  const route = `${req.method} ${new URL(req.url, 'http://x').pathname}`
  const time = new Date().toLocaleTimeString('vi-VN')
  if (!authorized(req.headers.authorization)) {
    console.log(`${time} 401 ${route}`)
    return send(res, 401, 'unauthorized')
  }
  if (!ALLOWED.has(route)) {
    console.log(`${time} 404 ${route}`)
    return send(res, 404, 'not found')
  }
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) {
    return send(res, 413, 'request too large')
  }
  const started = Date.now()
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      // Ollama answers requests addressed to itself; the key stays here.
      headers: { 'content-type': req.headers['content-type'] ?? 'application/json', host: target.host },
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, { 'content-type': answer.headers['content-type'] ?? 'application/json' })
      answer.pipe(res)
      answer.on('end', () => console.log(`${time} ${answer.statusCode} ${route} ${((Date.now() - started) / 1000).toFixed(1)} s`))
    },
  )
  upstream.on('error', (e) => {
    console.log(`${time} 502 ${route} Ollama is not answering: ${e.message}`)
    if (!res.headersSent) send(res, 502, 'Ollama is not running')
  })
  req.pipe(upstream)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Ollama proxy on http://127.0.0.1:${port} -> ${target.origin} (POST /api/chat, GET /api/tags with the key)`)
})
