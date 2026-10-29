/*
 * The Admin's flow for a Term, in the order it happens (spec §5, §6.3, §6.4): get the dormitory ready once, take
 * a Manager's request, build the Term in the wizard, publish it, then registration opens and Managers take over.
 * The Overview shows the stages with their state; every screen of the flow shows where it sits (FlowTrail).
 */

export const ADMIN_STAGES = [
  {
    key: 'ready',
    label: 'Get the dormitory ready',
    why: 'Every new Term starts from these values; a gap here stops the desk or payments later.',
  },
  {
    key: 'request',
    label: "Take a Manager's request",
    why: 'Managers decide dates, Rooms, places and prices; the wizard copies their request so nothing is typed twice.',
  },
  {
    key: 'build',
    label: 'Build the Term',
    why: 'Six steps fix what students will be offered: dates, Rooms, prices, rules and the information they read.',
  },
  {
    key: 'publish',
    label: 'Publish',
    why: 'Publishing fixes prices and rules for the Term and puts its announcement on every student’s board.',
  },
  {
    key: 'open',
    label: 'Registration opens',
    why: 'From here Managers run the Term: Applications, assignment and payments.',
  },
]

/** Screens of the "ready" stage, in the order to go through them. */
export const READY_SCREENS = [
  { to: '/admin/buildings', label: 'Buildings and Rooms', why: 'The Blocks, Floors and Rooms whose Beds a Term offers.' },
  { to: '/admin/room-types', label: 'Room Types', why: 'Beds per Room and the base price every Term starts from.' },
  { to: '/admin/room-classes', label: 'Room Classes', why: 'Basic, Standard or Premium: the surcharge and the furniture each class needs.' },
  { to: '/admin/fees', label: 'Deposit', why: 'What a student pays to hold a place, and when it is refunded.' },
  { to: '/admin/utility', label: 'Utility', why: 'Electricity and water prices and the Utility Deposit.' },
  { to: '/admin/eligibility', label: 'Who may apply', why: 'Who can apply and who goes first.' },
  { to: '/admin/matching', label: 'Roommate matching', why: 'How the assignment puts students together.' },
  { to: '/admin/deadlines', label: 'Deadlines and reminders', why: 'How long students have to pay or answer, and when they are reminded.' },
  { to: '/admin/refunds', label: 'Refunds, penalties and terminations', why: 'What is returned or kept when a stay ends early.' },
  { to: '/admin/stay', label: 'Stay and renewal', why: 'Stay length and how residents continue into the next Term.' },
  { to: '/admin/inspection-checklists', label: 'Inspection checklists', why: 'What Staff check in a Room at check-in, inspections and check-out.' },
  { to: '/admin/users', label: 'Users and roles', why: 'Managers and Staff for every Block, so requests reach someone.' },
]

/** Where a path sits in the flow, or null when it is not part of it. */
export function flowPosition(pathname) {
  const ready = READY_SCREENS.findIndex((s) => pathname === s.to || pathname.startsWith(`${s.to}/`))
  if (ready >= 0) return { stage: 0, screen: ready, current: READY_SCREENS[ready], next: READY_SCREENS[ready + 1] ?? { to: '/admin/term-requests', label: "Managers' requests" } }
  if (pathname.startsWith('/admin/term-requests')) return { stage: 1, next: { to: '/admin/terms', label: 'Terms' } }
  if (pathname === '/admin/terms' || pathname.startsWith('/admin/terms/')) return { stage: 2 }
  return null
}

/**
 * The state of each stage from GET /dashboards/admin (checks), GET /term-requests (counts) and GET /admin/terms.
 * The cycle follows the Term being set up now: a Draft if one exists, else an open request (a Term still to build),
 * else the latest published Term. Get-ready is checked on its own: a gap there is always work to do now.
 * Returns [{ ...stage, state: 'done' | 'now' | 'waiting' | 'later', detail, action: { to, label } }].
 */
export function stageStates({ checks = [], requestCounts = {}, terms = [], now = new Date() }) {
  const readyChecks = checks.filter((c) => c.link !== '/admin/terms')
  const missing = readyChecks.filter((c) => !c.ok)
  const openRequests = (requestCounts.Submitted ?? 0) + (requestCounts['In progress'] ?? 0) + (requestCounts['Needs changes'] ?? 0)
  const newest = (list) => [...list].sort((a, b) => String(b.stayStart).localeCompare(String(a.stayStart)))[0]
  const draft = newest(terms.filter((x) => x.status === 'Draft'))
  const published = newest(terms.filter((x) => x.status !== 'Draft' && new Date(x.stayEnd) >= now))
  const draftSteps = draft ? Math.min(draft.wizardStep ?? 0, 6) : 0
  const opened = published?.registrationOpensAt && new Date(published.registrationOpensAt) <= now

  // Which cycle the lane shows: building a Draft, a request still to build, or the published Term.
  const cycle = draft ? 'draft' : openRequests ? 'request' : published ? 'published' : 'empty'
  const state = {
    ready: missing.length ? 'now' : readyChecks.length ? 'done' : 'later',
    request: { draft: 'done', request: 'now', published: 'done', empty: 'waiting' }[cycle],
    build: { draft: draftSteps >= 6 ? 'done' : 'now', request: 'later', published: 'done', empty: 'now' }[cycle],
    publish: { draft: draftSteps >= 6 ? 'now' : 'later', request: 'later', published: 'done', empty: 'later' }[cycle],
    open: cycle === 'published' ? (opened ? 'done' : 'waiting') : 'later',
  }

  const facts = {
    ready: {
      detail: missing.length ? { text: '{n} of {total} ready', vars: { n: readyChecks.length - missing.length, total: readyChecks.length } } : { text: 'Everything is ready' },
      action: missing[0]?.link ? { to: missing[0].link, label: 'Fix the first gap' } : { to: READY_SCREENS[0].to, label: 'Review the set-up' },
      items: readyChecks,
    },
    request: {
      detail: openRequests
        ? { text: '{n} open', vars: { n: openRequests } }
        : cycle === 'empty'
          ? { text: 'Waiting for a Manager · you can also start without one' }
          : { text: 'Built from a request or by hand' },
      action: { to: '/admin/term-requests', label: openRequests ? 'Open the requests' : 'See the requests' },
    },
    build: {
      detail: draft
        ? { text: '{name}: {n} of {total} steps', vars: { name: draft.name, n: draftSteps, total: 6 } }
        : cycle === 'published'
          ? { text: '{name} is built', vars: { name: published.name } }
          : { text: 'No Term in progress' },
      action: draft ? { to: `/admin/terms/${draft.id}`, label: 'Continue the wizard' } : { to: '/admin/terms/new', label: 'Start a new Term' },
    },
    publish: {
      detail: cycle === 'published' ? { text: '{name} is published', vars: { name: published.name } } : draft && draftSteps >= 6 ? { text: 'Ready to check and publish' } : { text: 'After the six steps' },
      action: draft ? { to: `/admin/terms/${draft.id}?step=review`, label: 'Check and publish' } : { to: '/admin/terms', label: 'See the Terms' },
    },
    open: {
      detail: cycle === 'published' && published.registrationOpensAt ? { text: opened ? 'Opened {date}' : 'Opens {date}', vars: { date: published.registrationOpensAt }, date: true } : { text: 'After publishing' },
      action: { to: '/admin/terms', label: 'See the Terms' },
    },
  }
  return ADMIN_STAGES.map((stage) => ({ ...stage, state: state[stage.key], ...facts[stage.key] }))
}
