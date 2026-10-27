// Renders every docs/diagrams/*.mmd (Mermaid) to docs/diagrams/out/<name>.svg and .png for the reports.
// Starts a local page that runs Mermaid in a browser: open http://localhost:4317/ and wait for "done".
// Labels are drawn as SVG text (no HTML labels), so Word and the PNG conversion keep them.
//
//   node docs/tools/render-diagrams.mjs [name-filter]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../diagrams');
const outDir = path.join(dir, 'out');
fs.mkdirSync(outDir, { recursive: true });
const filter = process.argv[2] ?? '';
const list = () => fs.readdirSync(dir).filter((f) => f.endsWith('.mmd') && f.includes(filter)).sort()
  .map((f) => ({ name: f.replace(/\.mmd$/, ''), code: fs.readFileSync(path.join(dir, f), 'utf8') }));

const page = `<!doctype html><html><head><meta charset="utf-8"><title>render</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script></head>
<body style="font-family:Arial"><pre id="log">rendering…</pre><div id="work"></div><script>
const log = (s) => (document.getElementById('log').textContent += '\\n' + s);
mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose', htmlLabels: false,
  fontFamily: 'Arial', flowchart: { htmlLabels: false, curve: 'basis', useMaxWidth: false },
  sequence: { useMaxWidth: false, mirrorActors: false }, er: { useMaxWidth: false }, state: { useMaxWidth: false },
  class: { useMaxWidth: false, htmlLabels: false }, themeVariables: { fontSize: '14px', background: '#ffffff', compositeBackground: '#f6f6f6', compositeTitleBackground: '#ececec' } });
async function toPng(svgText) {
  const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
  const vb = (svg.getAttribute('viewBox') || '0 0 800 600').split(/[ ,]+/).map(Number);
  const w = Math.ceil(vb[2]), h = Math.ceil(vb[3]);
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
  const scale = 2, canvas = document.createElement('canvas');
  canvas.width = w * scale; canvas.height = h * scale;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  const png = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  // A wide diagram is also drawn turned a quarter left when its 14 px text would print below 6.5 pt on a portrait
  // page (text area about 16 × 23 cm) and turning it prints it at least 25 % larger.
  let rotated = null;
  const upright = Math.min(16 / w, 23 / h);
  if ((14 * upright) / 0.0353 < 6.5 && Math.min(23 / w, 16 / h) > 1.25 * upright) {
    const r = document.createElement('canvas');
    r.width = canvas.height; r.height = canvas.width;
    const rg = r.getContext('2d');
    rg.translate(0, r.height); rg.rotate(-Math.PI / 2); rg.drawImage(canvas, 0, 0);
    rotated = await new Promise((ok) => r.toBlob(ok, 'image/png'));
  }
  return { png, rotated };
}
(async () => {
  const items = await (await fetch('/list')).json();
  let failed = 0;
  for (const it of items) {
    try {
      let { svg } = await mermaid.render('d' + Math.random().toString(36).slice(2), it.code, document.getElementById('work'));
      // A composite state's box comes without a fill (Mermaid 10) and would print black: give its group one.
      svg = svg.replaceAll('<g class="cluster" id=', '<g class="cluster" style="fill:#f6f6f6;stroke:#9370DB" id=');
      await fetch('/save?name=' + it.name + '&ext=svg', { method: 'POST', body: svg });
      const { png, rotated } = await toPng(svg);
      await fetch('/save?name=' + it.name + '&ext=png', { method: 'POST', body: png });
      if (rotated) await fetch('/save?name=' + it.name + '-r&ext=png', { method: 'POST', body: rotated });
      log('ok ' + it.name);
    } catch (e) { failed++; log('FAIL ' + it.name + ': ' + (e.message || e)); await fetch('/fail?name=' + it.name, { method: 'POST', body: String(e.message || e) }); }
  }
  log('done ' + items.length + ' (' + failed + ' failed)');
  await fetch('/done?failed=' + failed, { method: 'POST' });
})();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(page); }
  if (url.pathname === '/list') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(list())); }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const name = (url.searchParams.get('name') ?? '').replace(/[^\w-]/g, '');
    if (url.pathname === '/save' && url.searchParams.get('ext') === 'png' && !name.endsWith('-r')) fs.rmSync(path.join(outDir, `${name}-r.png`), { force: true });
    if (url.pathname === '/save') fs.writeFileSync(path.join(outDir, `${name}.${url.searchParams.get('ext') === 'png' ? 'png' : 'svg'}`), body);
    if (url.pathname === '/fail') console.log(`FAIL ${name}: ${body.toString().slice(0, 300)}`);
    if (url.pathname === '/done') { console.log(`done (${url.searchParams.get('failed')} failed)`); res.end('ok'); server.close(); return; }
    res.end('ok');
  });
});
server.listen(4317, () => console.log(`open http://localhost:4317/ (${list().length} diagrams)`));
