// Generates the logical ERDs in Chen's notation and the table catalogue of Report 4 (docs/reports/src/_db-design.md)
// from the database itself, so the ERDs and the descriptions match the Flyway schema. Input:
// docs/reports/data/dbmeta.json (information_schema of a migrated database) and docs/reports/data/tables.json (one
// description per table). The ERDs are written as models (docs/reports/build/erd-models.json) that
// docs/tools/drawio.mjs lays out into docs/diagrams/erd-<area>.drawio.
//
//   node docs/tools/gen-db-docs.mjs && node docs/tools/drawio.mjs layout docs/reports/build/erd-models.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/data/dbmeta.json'), 'utf8'));
const desc = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/data/tables.json'), 'utf8'));

const AREAS = [
  ['auth', 'Accounts and access (AUTH)'],
  ['cfg', 'Settings and Terms (CFG)'],
  ['inv', 'Inventory: Blocks, Rooms, Beds, furniture, door codes (INV)'],
  ['app', 'Applications (APP)'],
  ['asg', 'Assignment and residence (ASG)'],
  ['bil', 'Billing and Utility (BIL)'],
  ['req', 'Requests, routing and escalations (REQ)'],
  ['mnt', 'Maintenance and inspections (MNT)'],
  ['ntf', 'Notifications and announcements (NTF)'],
  ['shared', 'Shared: Audit Log and files'],
];
// Actor columns (who did what) reference auth_user from almost every table; the diagrams leave them out.
const OWNER_COLS = new Set(['student_id', 'user_id', 'reporter_id', 'assignee_id', 'owner_id', 'inspector_id', 'invitee_student_id']);
const KEY_COLS = /^(code|status|type|kind|name|label|amount|price|role|email|level|title|student_code|gender|stage|source|renewal|urgency|category|committed_terms|terms_used|verification|floor_no|asset_code|deposit_amount|term_price|due_at|stay_start|stay_end|period_start|result|reason|grp|surcharge_rate|beds|base_price|audience|event_key|outcome|extra_terms)$/;

const tables = new Map(meta.tables.map((t) => [t.name, t]));
const pk = new Map();
for (const p of meta.pks) pk.set(p.t, [...(pk.get(p.t) ?? []), p.c]);
const fks = [];
const seen = new Set();
for (const f of meta.fks) {
  const k = `${f.t}.${f.c}>${f.rt}`;
  if (seen.has(k)) continue;
  seen.add(k);
  fks.push(f);
}
const fkOf = (t) => fks.filter((f) => f.t === t);
const shown = (f) => f.rt !== 'auth_user' || OWNER_COLS.has(f.c);

// Attributes drawn as ovals: the primary key (underlined) and the main business columns. Foreign keys are drawn as
// relationships (diamonds), not as attributes.
function attributes(name) {
  const t = tables.get(name);
  const keys = pk.get(name) ?? [];
  const fkCols = new Set(fkOf(name).map((f) => f.c));
  return t.cols
    .filter((c) => (keys.includes(c.c) && !fkCols.has(c.c)) || (!fkCols.has(c.c) && KEY_COLS.test(c.c)))
    .slice(0, 8)
    .map((c) => ({ name: c.c, key: keys.includes(c.c) }));
}

// One area: its tables as entities with attributes, every foreign key as a relationship named after the column,
// cardinality 1 on the referenced side and N (or 1 when the column is the whole primary key) on the referencing side.
function areaModel(prefix, title) {
  const names = meta.tables.map((t) => t.name).filter((n) => n.startsWith(prefix + '_'));
  const set = new Set(names);
  const entities = names.map((n) => ({ id: n, label: n, attributes: attributes(n) }));
  const external = new Set();
  const relationships = [];
  for (const n of names) {
    for (const f of fkOf(n)) {
      if (!shown(f)) continue;
      if (!set.has(f.rt)) external.add(f.rt);
      const keys = pk.get(n) ?? [];
      const one = keys.length === 1 && keys[0] === f.c;
      relationships.push({ id: `${n}.${f.c}`, label: f.c.replace(/_id$/, '').replace(/_/g, ' '), from: n, fromCard: one ? '1' : 'N', to: f.rt, toCard: '1' });
    }
  }
  for (const x of external) entities.push({ id: x, label: x, attributes: [], external: true });
  return { name: `erd-${prefix}`, kind: 'chen', title: `Logical ERD (Chen's notation): ${title}`, entities, relationships };
}

const models = AREAS.map(([prefix, title]) => areaModel(prefix, title));
fs.mkdirSync(path.join(root, 'docs/reports/build'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/reports/build/erd-models.json'), JSON.stringify(models, null, 1));

let md = '';
const missing = [];
AREAS.forEach(([prefix, title], i) => {
  const names = meta.tables.map((t) => t.name).filter((n) => n.startsWith(prefix + '_'));
  md += `### 2.${i + 2} ${title}\n\n![Logical ERD (Chen's notation): ${title}](../../diagrams/out/erd-${prefix}.png)\n\n`;
  md += '| No | Table | Description | Keys |\n|---|---|---|---|\n';
  names.forEach((n, k) => {
    if (!desc[n]) missing.push(n);
    const keys = `PK: ${(pk.get(n) ?? []).join(', ') || '—'}`;
    const refs = fkOf(n).map((f) => `${f.c} → ${f.rt}`);
    md += `| ${String(k + 1).padStart(2, '0')} | ${n} | ${desc[n] ?? ''} | ${keys}${refs.length ? '<br>FK: ' + refs.join('<br>') : ''} |\n`;
  });
  md += '\n';
});
fs.writeFileSync(path.join(root, 'docs/reports/src/_db-design.md'), md);
console.log(`${meta.tables.length} tables in ${AREAS.length} areas; ERD models written${missing.length ? '; no description: ' + missing.join(', ') : ''}`);
