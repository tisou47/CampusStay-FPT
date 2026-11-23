// Takes the user-guide screenshots (Report 6) from a local stack in dev profile: the API on :8080, the web on :5173
// (`npm run dev` in web/), Docker's db and mail. Drives the installed Microsoft Edge headless over the DevTools
// protocol (no extra package). For each stage of tools/docs/screenshots.json it resets the demo data, signs in each
// account through the API (seed password 123, fictional accounts only), opens the page in English and saves a PNG
// to docs/Screenshots/<file>.
//   node tools/docs/screenshots.mjs [stage …]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BASE = 'http://localhost:5173'
const OUT = path.join(root, 'docs/Screenshots')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(method, p, body, token) {
  const r = await fetch(BASE + '/api' + p, { method, headers: { 'Content-Type': 'application/json', 'Accept-Language': 'en', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
const signIn = async (email) => api('POST', '/auth/sign-in', { email, password: '123', remember: true })

/** One Edge tab, driven over its DevTools WebSocket. */
async function browser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-edge-'))
  const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${dir}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page') } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Edge did not start')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0
  const waiting = new Map()
  const events = []
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id) } else if (msg.method) events.push(msg.method)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id
    waiting.set(n, (msg) => msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result))
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value
  const goto = async (url) => {
    events.length = 0
    await send('Page.navigate', { url })
    for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100)
  }
  return {
    goto, evaluate,
    async settle() {
      // The page has loaded; wait until its data calls are done (no spinner, the text stops changing).
      let last = ''
      for (let i = 0; i < 40; i++) {
        await sleep(250)
        const now = await evaluate('document.body.innerText.length + ":" + document.querySelectorAll("[aria-busy=true],.animate-spin,.animate-pulse").length')
        if (now === last && now.endsWith(':0')) break
        last = now
      }
    },
    async shot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'))
    },
    close() { ws.close(); proc.kill() },
  }
}

const plan = JSON.parse(fs.readFileSync(path.join(root, 'tools/docs/screenshots.json'), 'utf8'))
const only = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const b = await browser()
try {
  await b.goto(BASE + '/signin')
  for (const stage of plan.filter((s) => !only.length || only.includes(s.stage))) {
    const admin = await signIn('admin01@fpt.edu.vn')
    await api('POST', '/admin/demo/reset', { stage: stage.stage, confirm: 'RESET' }, admin.token)
    for (const s of stage.shots) {
      const email = s.as
      await b.evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('campusstay-lang', 'en'); true`)
      if (email) {
        const session = await signIn(email)
        session.user.locale = 'en'
        await b.evaluate(`localStorage.setItem('campusstay-session', ${JSON.stringify(JSON.stringify({ token: session.token, user: session.user }))}); true`)
      }
      await b.goto(BASE + s.path)
      await b.settle()
      if (s.click) await b.evaluate(`(() => { const el = [...document.querySelectorAll('button,a,[role=tab]')].find((e) => e.innerText.trim() === ${JSON.stringify(s.click)}); el?.click(); return !!el })()`), await b.settle()
      await b.shot(s.file)
      console.log(`${stage.stage} ${s.file} ${email ?? '(signed out)'} ${s.path}`)
    }
  }
} finally {
  b.close()
}
