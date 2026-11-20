// One-off: collects the change history kept from the old docs/ into docs/CHANGELOG.md.
// Sources are parsed as text (running them would start the Word build).
import { readFileSync, writeFileSync } from 'node:fs';

const NAMES = { T: 'Lê Thành Minh Trung', L: 'Nguyễn Xuân Lộc', D: 'Trần Võ Quang Duy', V: 'Võ Minh Luân', team: 'Lê Thành Minh Trung' };
const cell = (s) => String(s).replace(/\|/g, '\\|').trim();
const row = (cells) => `| ${cells.map(cell).join(' | ')} |`;
const toKey = (d) => d.split('/').reverse().join('');

// Parses a JS array literal like ['a', 'b', T] where bare identifiers are member names.
function parseArray(src) {
  const items = [];
  const re = /'((?:[^'\\]|\\.)*)'|([A-Za-z_]\w*)/g;
  let m;
  while ((m = re.exec(src))) items.push(m[1] !== undefined ? m[1].replace(/\\'/g, "'") : (NAMES[m[2]] ?? m[2]));
  return items;
}

// 1. Record of Changes of Reports 1–5.
const build = readFileSync('docs/reports/src/build.mjs', 'utf8');
const reports = [];
for (const m of build.matchAll(/(Report\d): \{[^\n]*changes: \[\n([\s\S]*?)\n\s*\] \}/g)) {
  for (const line of m[2].split('\n').filter((l) => l.trim().startsWith('['))) {
    const [date, kind, who, desc] = parseArray(line.trim().replace(/,$/, ''));
    reports.push([date, m[1], kind, who, desc]);
  }
}

// 2. Record of Changes of the registration form (BM03), version 1.0 → 2.0.
const brief = readFileSync('docs/reports/src/brief.mjs', 'utf8');
const bm03Block = brief.slice(brief.indexOf('const BM03'), brief.indexOf('const REGISTRATION'));
const rowsSrc = bm03Block.slice(bm03Block.indexOf('index: 2'), bm03Block.indexOf('index: 3'));
const bm03 = rowsSrc.split('\n').filter((l) => /^\s*\['\d+'/.test(l)).map((l) => parseArray(l.trim().replace(/,$/, '')));

// 3. Decision Log of the Project Brief §11.
const briefMd = readFileSync('docs/00_Project_Brief.md', 'utf8');
const log = briefMd.slice(briefMd.indexOf('## 11. Decision Log'));
const adrs = log.split('\n').filter((l) => /^\| ADR-\d+/.test(l));

reports.sort((a, b) => toKey(a[0]).localeCompare(toKey(b[0])) || a[1].localeCompare(b[1]));
const adrRows = adrs
  .map((l) => ({ l, d: (l.match(/\| (\d\d\/\d\d\/\d{4}) \|/) || [, '00/00/0000'])[1] }))
  .sort((a, b) => toKey(a.d).localeCompare(toKey(b.d)) || a.l.localeCompare(b.l, undefined, { numeric: true }))
  .map((x) => x.l);

const out = [
  '# CampusStay FPT — Change history',
  '',
  'Kept from the documentation before the SEP490 document reset (20/11/2026). The old sources (Reports 1–5 for Review 2, the Project Brief and the Change Specification v2) remain in the git history before that date.',
  '',
  '## Record of Changes — Reports',
  '',
  row(['Date', 'Report', 'A/M/D', 'In charge', 'Change description']),
  row(['---', '---', '---', '---', '---']),
  ...reports.map(row),
  '',
  '## Record of Changes — Registration form (BM03), version 1.0 (28/08/2026) → 2.0 (31/10/2026)',
  '',
  row(['No', 'Section', 'Version 1.0', 'Version 2.0', 'Reason', 'In charge']),
  row(['---', '---', '---', '---', '---', '---']),
  ...bm03.map(row),
  '',
  '## Decision Log',
  '',
  '| ID | Date | Decision | Reason |',
  '|---|---|---|---|',
  ...adrRows,
  '',
];
writeFileSync('docs/CHANGELOG.md', out.join('\n'));
console.log(`reports=${reports.length} bm03=${bm03.length} adrs=${adrRows.length}`);
