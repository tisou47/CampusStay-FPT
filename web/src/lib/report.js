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

const csvCell = (v) => {
  const s = String(v ?? '')
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
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 36px; text-align: center; }
  .sign div { min-height: 90px; }
  @media print { body { margin: 12mm; } .noprint { display: none; } }
</style></head><body>${bodyHtml}
<p class="noprint" style="margin-top:24px"><button onclick="window.print()">In / Lưu PDF</button></p>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300))</script>
</body></html>`)
  w.document.close()
  return true
}
