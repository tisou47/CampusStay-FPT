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
/** The print window's own words; pages pass them translated (WEB-ADM-06), these are the English defaults. */
const PRINT_WORDS = {
  print: 'Print / Save as PDF',
  previous: '← Previous',
  next: 'Next →',
  page: 'Page {n} of {total}',
  printOne: 'Print this page',
  printAll: 'Print / Save as PDF ({n} pages)',
}

/** Pages a multi-sheet report on screen and wires the print buttons of window `w`. */
function setUpPager(w, words) {
  const doc = w.document
  const sheets = Array.from(doc.querySelectorAll('.page-sheet'))
  const pager = doc.getElementById('pager')
  const singlePrint = doc.getElementById('singlePrint')
  singlePrint?.querySelector('button')?.addEventListener('click', () => w.print())
  if (sheets.length <= 1) {
    setTimeout(() => w.print(), 300)
    return
  }
  if (singlePrint) singlePrint.style.display = 'none'
  pager.style.display = 'flex'
  let current = 0
  const button = (text, onClick, className) => {
    const b = doc.createElement('button')
    b.textContent = text
    if (className) b.className = className
    b.addEventListener('click', onClick)
    return b
  }
  function render() {
    sheets.forEach((sheet, idx) => sheet.classList.toggle('hidden-screen', idx !== current))
    const tabs = doc.createElement('div')
    tabs.className = 'pager-tabs'
    const prev = button(words.previous, () => { current--; render() })
    prev.disabled = current === 0
    tabs.appendChild(prev)
    sheets.forEach((_, idx) => tabs.appendChild(button(String(idx + 1), () => { current = idx; render() }, idx === current ? 'active' : '')))
    const next = button(words.next, () => { current++; render() })
    next.disabled = current === sheets.length - 1
    tabs.appendChild(next)
    const info = doc.createElement('span')
    info.style.cssText = 'font-size:12px;color:#475569;margin-left:6px;font-weight:500;'
    info.textContent = words.page.replace('{n}', current + 1).replace('{total}', sheets.length)
    tabs.appendChild(info)
    const actions = doc.createElement('div')
    actions.className = 'pager-actions'
    actions.appendChild(button(words.printOne, () => { doc.body.classList.add('print-single'); w.print() }))
    actions.appendChild(button(words.printAll.replace('{n}', sheets.length), () => { doc.body.classList.remove('print-single'); w.print() }, 'primary'))
    pager.replaceChildren(tabs, actions)
    w.scrollTo({ top: 0 })
  }
  w.addEventListener('afterprint', () => doc.body.classList.remove('print-single'))
  render()
}

/** @param options { lang, words } — the language in use and the window's words translated by the page */
export function printDocument(title, bodyHtml, { lang = 'en', words: given } = {}) {
  const words = { ...PRINT_WORDS, ...given }
  const w = window.open('', '_blank', 'noopener=no,width=900,height=1000')
  if (!w) return false
  w.document.open()
  w.document.write(`<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
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
<p id="singlePrint" class="noprint" style="margin-top:24px"><button>${escapeHtml(words.print)}</button></p>
</body></html>`)
  w.document.close()
  // The pager runs from this window: the site's Content-Security-Policy, which the blank window inherits, blocks inline scripts.
  setUpPager(w, words)
  w.focus()
  return true
}
