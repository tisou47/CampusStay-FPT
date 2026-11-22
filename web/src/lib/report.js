/*
 * Reports a page builds in the browser: a CSV file to download, and a printable document (print or save as PDF)
 * opened in its own window so only the report is printed, not the app around it.
 */

const escapeHtml = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** A cell of a printable report, escaped. */
export const h = escapeHtml

/** A CSV cell; text starting with = + - @ or a tab is prefixed with ' so a spreadsheet never runs it as a formula. */
export const csvCell = (v) => {
  const raw = String(v ?? '')
  const s = typeof v === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** Downloads rows (arrays of cells, the first one the header) as a UTF-8 CSV that Excel opens with accents. */
export function downloadCsv(fileName, rows) {
  const text = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Opens `bodyHtml` (already escaped with h()) in a new window styled for paper and starts printing: the user prints
 * it or saves it as PDF. Returns false when the browser blocked the window.
 */
export function printDocument(title, bodyHtml) {
  const w = window.open('', '_blank', 'noopener=no,width=900,height=1000')
  if (!w) return false
  w.document.open()
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f1f1f; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; }
  .muted { color: #666; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 24px; margin-top: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #d6d6d6; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; font-weight: 600; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 999px; background: #eee; font-weight: 600; }
  .bad { background: #fde2e1; color: #a1221b; } .warn { background: #fff1d6; color: #8a5a00; } .ok { background: #dff3e4; color: #1d6b34; }
  img { width: 72px; height: 72px; object-fit: cover; border-radius: 6px; margin: 2px 4px 2px 0; border: 1px solid #ddd; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 36px; text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .sign div { min-height: 90px; }
  .page-sheet { position: relative; }
  .page-sheet.hidden-screen { display: none; }
  .page-num { font-size: 11px; color: #777; text-align: right; margin-bottom: 4px; }
  .pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; margin-bottom: 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
  .pager-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .pager-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .pager button { cursor: pointer; padding: 5px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #1f2937; font-size: 12px; font-weight: 500; }
  .pager button:hover:not(:disabled) { background: #f1f5f9; }
  .pager button:disabled { opacity: 0.45; cursor: not-allowed; }
  .pager button.active { background: #ea580c; color: #fff; border-color: #ea580c; font-weight: 600; }
  .pager button.primary { background: #ea580c; color: #fff; border-color: #ea580c; font-weight: 600; }
  .pager button.primary:hover { background: #c2410c; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4; margin: 12mm; }
  @media print {
    body { margin: 0; }
    .noprint { display: none !important; }
    .page-sheet.hidden-screen { display: block !important; }
    body.print-single .page-sheet.hidden-screen { display: none !important; }
    .page-sheet + .page-sheet { margin-top: 0; padding-top: 0; border-top: none; break-before: page; page-break-before: always; }
  }
</style></head><body>
<div id="pager" class="pager noprint" style="display:none"></div>
${bodyHtml}
<p id="singlePrint" class="noprint" style="margin-top:24px"><button onclick="window.print()">In / Lưu PDF</button></p>
<script>
(() => {
  const sheets = Array.from(document.querySelectorAll('.page-sheet'));
  const pager = document.getElementById('pager');
  const singlePrint = document.getElementById('singlePrint');
  if (sheets.length <= 1) {
    window.addEventListener('load', () => setTimeout(() => window.print(), 300));
    return;
  }
  if (singlePrint) singlePrint.style.display = 'none';
  pager.style.display = 'flex';
  let current = 0;
  function render() {
    sheets.forEach((s, idx) => s.classList.toggle('hidden-screen', idx !== current));
    const tabs = document.createElement('div');
    tabs.className = 'pager-tabs';
    const prev = document.createElement('button');
    prev.textContent = '← Trước';
    prev.disabled = current === 0;
    prev.onclick = () => { current--; render(); };
    tabs.appendChild(prev);
    sheets.forEach((_, idx) => {
      const b = document.createElement('button');
      b.textContent = String(idx + 1);
      if (idx === current) b.className = 'active';
      b.onclick = () => { current = idx; render(); };
      tabs.appendChild(b);
    });
    const next = document.createElement('button');
    next.textContent = 'Sau →';
    next.disabled = current === sheets.length - 1;
    next.onclick = () => { current++; render(); };
    tabs.appendChild(next);
    const info = document.createElement('span');
    info.style.cssText = 'font-size:12px;color:#475569;margin-left:6px;font-weight:500;';
    info.textContent = 'Trang ' + (current + 1) + ' / ' + sheets.length;
    tabs.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'pager-actions';
    const printOne = document.createElement('button');
    printOne.textContent = 'In trang này';
    printOne.onclick = () => {
      document.body.classList.add('print-single');
      window.print();
    };
    const printAll = document.createElement('button');
    printAll.className = 'primary';
    printAll.textContent = 'In / Lưu PDF (' + sheets.length + ' trang)';
    printAll.onclick = () => {
      document.body.classList.remove('print-single');
      window.print();
    };
    actions.appendChild(printOne);
    actions.appendChild(printAll);

    pager.replaceChildren(tabs, actions);
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('afterprint', () => document.body.classList.remove('print-single'));
  render();
})();
</script>
</body></html>`)
  w.document.close()
  w.focus()
  return true
}
