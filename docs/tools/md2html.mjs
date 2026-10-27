// Converts a report written in Markdown (docs/reports/src/*.md) into the HTML that build-report.ps1 inserts into the
// school's Word template. Only what the reports use: headings, paragraphs, bullet and numbered lists (two levels),
// pipe tables, images, page breaks, **bold**, *italic* and `code`. Images and page breaks become placeholders that
// Word replaces: [[IMG:<absolute path>|<width cm>]] and [[PAGEBREAK]].
//
//   node docs/tools/md2html.mjs <report.md> <out.html>
import fs from 'node:fs';
import path from 'node:path';

const [, , input, output] = process.argv;
const base = path.dirname(path.resolve(input));
// '@include <file>' on its own line inlines another Markdown file (relative to the including file).
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n')
  .flatMap((l) => (/^@include\s+/.test(l) ? read(path.resolve(path.dirname(file), l.replace(/^@include\s+/, '').trim())) : [l]));
const lines = read(path.resolve(input));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s) {
  let out = esc(s);
  out = out.replace(/&lt;br\s*\/?&gt;/g, '<br>');
  out = out.replace(/`([^`]+)`/g, '<span style="font-family:Consolas;font-size:9.5pt">$1</span>');
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+(?:\([^)\s]*\))?[^)\s]*)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<i>$2</i>');
  return out;
}

const html = [];
let figure = 0;
let i = 0;
let para = [];
const flush = () => {
  if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
  para = [];
};
const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

while (i < lines.length) {
  const line = lines[i];
  if (/^\s*$/.test(line)) { flush(); i++; continue; }
  if (/^<!--\s*pagebreak\s*-->/.test(line)) { flush(); html.push('<p>[[PAGEBREAK]]</p>'); i++; continue; }
  if (/^<!--/.test(line)) { while (i < lines.length && !lines[i].includes('-->')) i++; i++; continue; }
  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) { flush(); html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
  const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+(\d+(?:\.\d+)?))?\)\s*$/);
  if (img) {
    flush();
    figure++;
    let file = path.resolve(base, img[2]);
    // A wide diagram has a turned copy (<name>-r.png, see render-diagrams.mjs) that fills the page's height.
    const turned = file.replace(/.png$/, '-r.png');
    if (!img[3] && fs.existsSync(turned)) file = turned;
    if (!fs.existsSync(file)) throw new Error(`Missing image ${file}`);
    html.push(`<p align="center">[[IMG:${file}|${img[3] ?? ''}]]</p>`);
    if (img[1]) html.push(`<p align="center"><i>Figure ${figure}: ${inline(img[1])}</i></p>`);
    i++;
    continue;
  }
  if (/^\|/.test(line)) {
    flush();
    const rows = [];
    while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
    const header = cells(rows[0]);
    const body = rows.slice(/^\|[\s:|-]+\|$/.test(rows[1] ?? '') ? 2 : 1).map(cells);
    let t = '<table border="1" cellspacing="0" cellpadding="4" width="100%"><tr>';
    t += header.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr>';
    for (const r of body) t += '<tr>' + header.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('') + '</tr>';
    html.push(t + '</table><p></p>');
    continue;
  }
  const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (li) {
    flush();
    // A list: items at indent 0 and nested items at indent >= 2 (one level).
    const ordered = /\d/.test(li[2]);
    const items = [];
    while (i < lines.length) {
      const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (m) {
        if (m[1].length >= 2 && items.length) items.at(-1).children.push({ text: m[3], ordered: /\d/.test(m[2]) });
        else items.push({ text: m[3], children: [] });
        i++;
        continue;
      }
      // a continuation line of the previous item
      if (/^\s{2,}\S/.test(lines[i]) && items.length) {
        const last = items.at(-1);
        (last.children.length ? last.children.at(-1) : last).text += ' ' + lines[i].trim();
        i++;
        continue;
      }
      break;
    }
    const tag = ordered ? 'ol' : 'ul';
    let out = `<${tag}>`;
    for (const it of items) {
      out += `<li>${inline(it.text)}`;
      if (it.children.length) {
        const sub = it.children[0].ordered ? 'ol' : 'ul';
        out += `<${sub}>` + it.children.map((c) => `<li>${inline(c.text)}</li>`).join('') + `</${sub}>`;
      }
      out += '</li>';
    }
    html.push(out + `</${tag}>`);
    continue;
  }
  para.push(line.trim());
  i++;
}
flush();

const doc = `<html><head><meta charset="utf-8"><style>
body { font-family: Calibri; font-size: 11pt; }
th { background: #DCE6F1; font-weight: bold; }
td, th { vertical-align: top; font-size: 10pt; }
</style></head><body>
${html.join('\n')}
</body></html>`;
fs.writeFileSync(output, doc, 'utf8');
console.log(`${output}: ${html.length} blocks, ${figure} figures`);
