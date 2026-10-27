// Generates the tables of Report 3 that must match the code: screen descriptions and screen authorization (from
// docs/web/01_Screen_Map.md, itself generated from the router) and the application messages list (from the API's
// message catalogue backend/src/main/resources/i18n/messages_vi.txt).
//
//   node docs/tools/gen-srs-tables.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = (f, s) => fs.writeFileSync(path.join(root, 'docs/reports/src', f), s);

// ---------- screens ----------
const map = fs.readFileSync(path.join(root, 'docs/web/01_Screen_Map.md'), 'utf8').split('\n');
const ROLE = { Public: 'Public', Student: 'Student', Staff: 'Staff', Block: 'Manager', Admin: 'Admin' };
let role = null;
const rows = [];
for (const line of map) {
  const h = line.match(/^## (\w+)/);
  if (h) { role = ROLE[h[1]] ?? null; continue; }
  const m = line.match(/^\| (SCR-[A-Z]+-\d+) \| ([^|]+) \| `([^`]+)` \| [^|]* \| ([^|]*) \|/);
  if (role && m) rows.push({ role, code: m[1], name: m[2].replace(/\s*\(`[^)]*`\)/g, '').trim(), route: m[3], api: m[4].trim() });
}
const apiText = (s) => {
  const calls = s.split('<br>').map((c) => c.replace(/`/g, '').trim().replace(/:$/, '')).filter((c) => c && c !== '—');
  return calls.length ? calls.slice(0, 4).join('<br>') + (calls.length > 4 ? `<br>(+${calls.length - 4} more)` : '') : '—';
};
let md = '';
for (const r of ['Public', 'Student', 'Staff', 'Manager', 'Admin']) {
  const list = rows.filter((x) => x.role === r);
  md += `**${r === 'Public' ? 'Public pages (no sign-in)' : r + ' screens'}** (${list.length})\n\n| # | Screen | Route | Main API calls |\n|---|---|---|---|\n`;
  list.forEach((x, i) => { md += `| ${i + 1} | ${x.code} ${x.name} | ${x.route} | ${apiText(x.api)} |\n`; });
  md += '\n';
}
out('_screens.md', md);

// Authorization: one row per screen code and name, a column per role.
const DATA = { Public: '—', Student: 'Own data', Staff: 'Own Blocks', Manager: 'All Blocks', Admin: 'All' };
const byScreen = new Map();
for (const x of rows) {
  const key = `${x.code} ${x.name.replace(/ –.*$/, '').replace(/^Application Wizard.*/, 'Application Wizard')}`;
  if (!byScreen.has(key)) byScreen.set(key, new Set());
  byScreen.get(key).add(x.role);
}
let auth = '| Screen | Student | Staff | Manager | Admin |\n|---|---|---|---|---|\n';
for (const [key, roles] of byScreen) {
  if (roles.has('Public')) { auth += `| ${key} | X (public) | X (public) | X (public) | X (public) |\n`; continue; }
  auth += `| ${key} | ${['Student', 'Staff', 'Manager', 'Admin'].map((r) => (roles.has(r) ? `X (${DATA[r]})` : '')).join(' | ')} |\n`;
}
out('_authorization.md', auth);

// ---------- messages ----------
const lines = fs.readFileSync(path.join(root, 'backend/src/main/resources/i18n/messages_vi.txt'), 'utf8').split('\n')
  .filter((l) => l.includes('⟶') && !l.startsWith('#'))
  .map((l) => l.split('⟶').map((s) => s.trim()))
  .filter(([en]) => /[.?]$/.test(en) && en.split(' ').length >= 4);
const kind = (en) => (/^(Enter|Choose|Type|Keep|Write|Give|Pick|Add|Say|Select|Upload|Attach)\b/.test(en) ? 'Field'
  : /permission|not allowed|only|cannot|can't|may not/i.test(en) ? 'Refused' : 'Dialog');
let msg = '| # | Code | Type | Content (English) | Content (Vietnamese) |\n|---|---|---|---|---|\n';
lines.forEach(([en, vi], i) => { msg += `| ${i + 1} | MSG${String(i + 1).padStart(3, '0')} | ${kind(en)} | ${en.replace(/\|/g, '/')} | ${vi.replace(/\|/g, '/')} |\n`; });
out('_messages.md', msg);
console.log(`${rows.length} screen routes, ${byScreen.size} screens in the authorization table, ${lines.length} messages`);
