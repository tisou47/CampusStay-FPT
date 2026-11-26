/*
 * A small XLSX writer for exports built in the browser: several sheets, a fixed set of cell styles (title, header,
 * bordered cells, bed-state fills, percent), column widths, merged title rows, a frozen header and an auto filter.
 * No dependency: the workbook is a zip (stored, not compressed) of SpreadsheetML parts with inline strings, which
 * Excel, WPS and LibreOffice open with Vietnamese text intact (unlike a comma CSV in a Vietnamese-locale Excel).
 */

/** Cell style ids (index into cellXfs below). */
export const XS = {
  default: 0,
  title: 1,
  subtitle: 2,
  header: 3,
  cell: 4,
  strong: 5,
  center: 6,
  percent: 7,
  totalLabel: 8,
  totalNumber: 9,
  totalPercent: 10,
  // Bed states: a light fill of the state's colour, bordered.
  unpaid: 11,
  paid: 12,
  resident: 13,
  leaving: 14,
  next_term: 15,
  available: 16,
  oos: 17,
  muted: 18,
}

const STATE_FILLS = ['FFF3CD', 'FFF1E6', 'FDE3D0', 'FFFBEB', 'E3EEF9', 'EEF8EF', 'EFEAE5']

const styles = () => {
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', fill('C64F0E'), fill('F5F0EB'), ...STATE_FILLS.map(fill)]
  // xf(font, fill, border, align, numFmt)
  const xfs = [
    xf(0, 0, 0),
    xf(2, 0, 0),
    xf(3, 0, 0),
    xf(4, 2, 1, 'center'),
    xf(0, 0, 1),
    xf(1, 0, 1),
    xf(0, 0, 1, 'center'),
    xf(0, 0, 1, 'center', 9),
    xf(1, 3, 1),
    xf(1, 3, 1, 'center'),
    xf(1, 3, 1, 'center', 9),
    ...STATE_FILLS.map((_, i) => xf(0, 4 + i, 1)),
    xf(5, 0, 1),
  ]
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="6">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FF1D1714"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF5C4F46"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="11"/><color rgb="FF75665B"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="${fills.length}">${fills.join('')}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left', 'right', 'top', 'bottom'].map((s) => `<${s} style="thin"><color rgb="FFD9CEC4"/></${s}>`).join('')}<diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
}

function fill(rgb) {
  return `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`
}

function xf(font, fillId, border, align, numFmt = 0) {
  const a = `<alignment vertical="center"${align ? ` horizontal="${align}"` : ''} wrapText="1"/>`
  return `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fillId}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${numFmt ? ' applyNumberFormat="1"' : ''}>${a}</xf>`
}

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML 1.0 cannot carry.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

/** 0 → "A", 27 → "AB". */
export function colName(i) {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** A sheet name Excel accepts: at most 31 characters, none of []:*?/\ and unique in the workbook. */
function sheetName(name, used) {
  let base = String(name).replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 28)} ${i}`
  used.add(candidate.toLowerCase())
  return candidate
}

/**
 * sheet: { name, cols: [width], rows: [[cell]], merges: ['A1:F1'], freezeRow (rows above stay), filter: 'A4:F20',
 *   heights: { rowIndex: points } }; cell: null | value | { v, s } (s: an XS id).
 */
function sheetXml(sheet) {
  const rows = sheet.rows
    .map((row, r) => {
      const ht = sheet.heights?.[r]
      const cells = (row ?? [])
        .map((cell, c) => {
          if (cell == null) return ''
          const { v, s = XS.default } = typeof cell === 'object' ? cell : { v: cell }
          const ref = `${colName(c)}${r + 1}`
          if (v == null || v === '') return `<c r="${ref}" s="${s}"/>`
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`
          return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`
    })
    .join('')
  const pane = sheet.freezeRow
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const cols = sheet.cols?.length ? `<cols>${sheet.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const filter = sheet.filter ? `<autoFilter ref="${sheet.filter}"/>` : ''
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${rows}</sheetData>${filter}${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
}

/** Builds the workbook and returns its bytes. */
export function buildXlsx(sheets) {
  const used = new Set()
  const names = sheets.map((s) => sheetName(s.name, used))
  const files = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${definedNames(sheets, names)}</workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['xl/styles.xml', styles()],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ]
  return zip(files)
}

// The auto filter needs its hidden defined name for Excel to show the filter buttons on every sheet.
function definedNames(sheets, names) {
  const list = sheets
    .map((s, i) => {
      if (!s.filter) return ''
      const [a, b] = s.filter.split(':')
      const abs = (ref) => ref.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2')
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!${abs(a)}:${abs(b)}</definedName>`
    })
    .join('')
  return list ? `<definedNames>${list}</definedNames>` : ''
}

/** Saves the bytes as a file download. */
export function saveXlsx(bytes, fileName) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ---------------------------------------------------------------- zip (stored) */

let crcTable
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files) {
  const enc = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  for (const [name, content] of files) {
    const nameBytes = enc.encode(name)
    const data = enc.encode(content)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // stored
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    parts.push(new Uint8Array(local.buffer), nameBytes, data)
    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint16(8, 0x0800, true)
    dir.setUint16(10, 0, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, data.length, true)
    dir.setUint32(24, data.length, true)
    dir.setUint16(28, nameBytes.length, true)
    dir.setUint32(42, offset, true)
    central.push(new Uint8Array(dir.buffer), nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const dirSize = central.reduce((a, b) => a + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, dirSize, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0))
  let p = 0
  for (const a of all) {
    out.set(a, p)
    p += a.length
  }
  return out
}
