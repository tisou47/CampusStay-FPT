// Small parsers for Report 3 (SRS): scheduled jobs, event listeners, page titles and Javadoc sentences. Pure functions.

/** The first sentence of the Javadoc ending right before `index`, '' if there is none. */
export function javadocBefore(src, index) {
  const before = src.slice(0, index)
  const m = before.match(/\/\*\*([\s\S]*?)\*\/\s*(?:@\w+(?:\((?:[^()]|\([^()]*\))*\))?\s*)*$/)
  if (!m) return ''
  const text = m[1].replace(/^\s*\*\s?/gm, ' ').replace(/\{@(?:code|link|linkplain)\s+([^}]*)\}/g, '$1').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  return text.match(/^(.*?[.!?])(\s|$)/)?.[1] ?? text
}

/** `@Scheduled` methods: [{ class, method, schedule, description }]. */
export function scheduledJobs(src, cls) {
  const out = []
  for (const m of src.matchAll(/@Scheduled\(((?:[^()]|\([^()]*\))*)\)\s*(?:@\w+(?:\((?:[^()]|\([^()]*\))*\))?\s*)*(?:public\s+)?[\w<>[\],.? ]+?\s+(\w+)\s*\(/g)) {
    const args = m[1]
    const key = args.match(/\$\{([\w.-]+)(?::([^}]*))?\}/)
    const cron = args.match(/cron\s*=\s*"([^"]*)"/)?.[1]
    const schedule = cron ? `cron ${cron}` : key ? `every ${key[2] ?? '?'} (setting ${key[1]})` : args.replace(/\s+/g, ' ').trim()
    out.push({ class: cls, method: m[2], schedule, description: javadocBefore(src, m.index) })
  }
  return out
}

/** `@EventListener` / `@TransactionalEventListener` methods: [{ class, event, after, description }]. */
export function eventListeners(src, cls) {
  const out = []
  for (const m of src.matchAll(/@(Transactional)?EventListener\b(?:\((?:[^()]|\([^()]*\))*\))?\s*(?:@\w+(?:\((?:[^()]|\([^()]*\))*\))?\s*)*(?:public\s+)?[\w<>[\],.? ]+?\s+(\w+)\s*\(\s*(?:final\s+)?(\w+)/g)) {
    out.push({ class: cls, event: m[3], method: m[2], after: Boolean(m[1]), description: javadocBefore(src, m.index) })
  }
  return out
}

/** The title and subtitle of a web page from its `<PageHeader title=… subtitle=…>`; '' when written as an expression. */
export function pageHeader(src) {
  const h = src.match(/<PageHeader\b([\s\S]*?)(?:\/>|>)/)?.[1] ?? ''
  const attr = (n) => h.match(new RegExp(`\\b${n}=(?:"([^"]*)"|\\{'([^']*)'\\}|\\{\`([^\`$]*)\`\\})`))
  const pick = (n) => { const m = attr(n); return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '' }
  return { title: pick('title'), subtitle: pick('subtitle') }
}

/** Validation messages written in a controller's request records: `message = "…"`. */
export function validationMessages(src) {
  return [...new Set([...src.matchAll(/message\s*=\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]))]
}

/** The `service.<feature>.<Class>` types a controller imports. */
export function importedServices(src) {
  return [...src.matchAll(/^import vn\.fpt\.campusstay\.service\.\w+\.(\w+);/gm)].map((m) => m[1])
}
