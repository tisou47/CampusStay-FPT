// The diagrams are draw.io files in docs/Diagrams/<NN_Type>/<name>.drawio, each with its PNG export beside it. This tool:
//
//   node tools/docs/pipeline/drawio.mjs layout <models.json> [filter]   (filter: parts of names, comma-separated)
//       lays out diagram models with ELK and writes docs/Diagrams/<model.name>.drawio (name = "<folder>/<file>")
//   node tools/docs/pipeline/drawio.mjs export [filter]
//       opens every .drawio under docs/Diagrams in draw.io (embed.diagrams.net) and saves the PNG draw.io exports
//       beside it (wide diagrams also <name>-r.png, turned to fill a portrait page)
//
// Both run in a browser: open http://localhost:4318/ and wait for "done" (drawio-page.js does the work).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../../docs/Diagrams');
fs.mkdirSync(dir, { recursive: true });
const [mode, arg1, arg2] = process.argv.slice(2);
const pick = (filter) => (name) => (filter ?? '').split(',').some((f) => name.includes(f));
const drawioFiles = () => fs.readdirSync(dir, { recursive: true }).map((f) => f.replaceAll('\\', '/'))
  .filter((f) => f.endsWith('.drawio')).sort();
let job;
if (mode === 'layout') {
  job = { mode, models: JSON.parse(fs.readFileSync(path.resolve(arg1), 'utf8')).filter((m) => pick(arg2)(m.name)) };
} else if (mode === 'export') {
  job = {
    mode,
    files: drawioFiles().filter((f) => pick(arg1)(f))
      .map((f) => ({ name: f.replace(/\.drawio$/, ''), xml: fs.readFileSync(path.join(dir, f), 'utf8') })),
  };
} else {
  console.error('usage: node tools/docs/pipeline/drawio.mjs layout <models.json> [filter] | export [filter]');
  process.exit(2);
}

const page = `<!doctype html><html><head><meta charset="utf-8"><title>drawio ${mode}</title>
<script src="https://cdn.jsdelivr.net/npm/elkjs@0.9.3/lib/elk.bundled.js"></script></head>
<body style="font-family:Arial"><pre id="log">${mode}…</pre><script src="/page.js?v=${Date.now()}"></script></body></html>`;

const body = (req) => new Promise((ok) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => ok(Buffer.concat(chunks)));
});
let count = 0;
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(page);
  if (url.pathname === '/page.js') return res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end(fs.readFileSync(path.join(here, 'drawio-page.js')));
  if (url.pathname === '/job') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(job));
  if (url.pathname === '/log') {
    const msg = (await body(req)).toString();
    if (msg.startsWith('FAIL')) console.log(msg);
    return res.end();
  }
  if (url.pathname === '/save') {
    const name = url.searchParams.get('name');
    const ext = url.searchParams.get('ext');
    // "<NN_Type>/<file>", nothing else: no way out of docs/Diagrams.
    if (!/^\d\d_[\w-]+\/[\w.-]+$/.test(name) || !['drawio', 'png'].includes(ext)) return res.writeHead(400).end();
    const data = await body(req);
    const file = path.join(dir, `${name}.${ext}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // A new upright picture replaces the turned copy of an older export.
    if (ext === 'png' && !name.endsWith('-r')) fs.rmSync(path.join(dir, `${name}-r.png`), { force: true });
    fs.writeFileSync(file, data);
    count++;
    return res.end();
  }
  if (url.pathname === '/done') {
    console.log(`done (${count} files written, ${url.searchParams.get('failed')} failed)`);
    res.end();
    setTimeout(() => process.exit(0), 100);
    return undefined;
  }
  return res.writeHead(404).end();
}).listen(4318, () => console.log(`open http://localhost:4318/ (${mode}: ${(job.models ?? job.files).length} diagrams)`));
