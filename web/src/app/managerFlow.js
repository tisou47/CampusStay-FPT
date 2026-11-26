/*
 * The Manager's and the Staff's flows through a Term, in the order it happens (spec §5, §6.6–§6.12): the stages are those of
 * termJourney (same keys and dates), and each stage lists its screens in the order to use them. The Overview
 * shows what the current stage asks for; every screen of the flow shows where it sits (FlowTrail).
 */

export const MANAGER_STAGES = [
  {
    key: 'registration',
    label: 'Registration',
    why: 'Students apply and pay their deposit; their accounts must be verified before they can apply.',
    screens: [
      { to: '/manager/term-requests', label: 'Period requests', why: 'Ask the admin to open the term with its dates, rooms, places and prices.' },
      { to: '/manager/student-import', label: 'Import student list', why: 'The enrolled list verifies students’ accounts, so they can apply.' },
      { to: '/manager/students', daily: true, label: 'Students', why: 'Verify the accounts still waiting and look up any student.' },
      { to: '/manager/applications', label: 'Applications', why: 'Review applications as they come in; only reviewed ones go into the assignment.' },
    ],
  },
  {
    key: 'assignment',
    label: 'Review and assignment',
    why: 'Every application is decided, then the assignment places students in beds block by block.',
    screens: [
      { to: '/manager/applications', label: 'Applications', why: 'Finish the review: the assignment only takes approved applications.' },
      { to: '/manager/room-classes', label: 'Room tiers by term', why: 'Set each room’s class for the term before beds are given out; prices follow it.' },
      { to: '/manager/assignment', label: 'Assignment', why: 'Run it, resolve the conflicts it flags, then commit each block; Round 2 offers the beds left.' },
    ],
  },
  {
    key: 'payment',
    label: 'Balance payment',
    why: 'Placed students pay their balance; unpaid balances past the deadline lose their bed.',
    screens: [
      { to: '/manager/payment-claims', daily: true, label: 'Payment confirmations', why: 'Students’ deadlines stop while their transfer waits for you: confirm or reject each one.' },
      { to: '/manager/payments', daily: true, label: 'Payments', why: 'Every invoice of the term and what is still unpaid.' },
      { to: '/manager/finance', daily: true, label: 'Collections and refunds', why: 'Send reminders and decide refunds.' },
    ],
  },
  {
    key: 'checkin',
    label: 'Check-in',
    why: 'Paid residents receive their door code and move in; late arrivals need a decision.',
    screens: [
      { to: '/manager/door-codes', daily: true, label: 'Door codes', why: 'Codes are released to paid residents once the lock is confirmed.' },
      { to: '/manager/approvals', daily: true, label: 'Decisions', why: 'Late check-ins and other requests that need a manager.' },
    ],
  },
  {
    key: 'stay',
    label: 'Living in',
    why: 'Residents live in; before the term ends the next one is prepared: requests, enrollment, fees and turnover.',
    screens: [
      { to: '/manager/next-term', label: 'Term transition', why: 'The requests window: room changes, swaps, room tiers, extensions and end of stay for next term.' },
      { to: '/manager/room-changes', label: 'Room changes and swaps', why: 'Decide moves across blocks; staff decide those inside one block.' },
      { to: '/manager/reconciliation', label: 'Reconciliation', why: 'Residents not enrolled next term lose their next-term bed before fees are issued.' },
      { to: '/manager/next-term/fees', label: 'Next-term fees', why: 'One fee per continuing resident; unpaid by the deadline, the bed is released.' },
      { to: '/manager/terminations', daily: true, label: 'Terminations', why: 'End a stay early for debt, enrollment or a manager decision.' },
    ],
  },
]

/**
 * Where a path sits in a role's stages ({ stage, screen }), or null. Screens marked daily are used whatever the
 * stage (payments, maintenance, readings…): the trail shows their stage but no warning when the Term is elsewhere.
 */
export function stagePosition(stages, pathname, liveStage = -1) {
  let best = null
  stages.forEach((stage, si) =>
    stage.screens.forEach((s, i) => {
      const hit = pathname === s.to || pathname.startsWith(`${s.to}/`)
      // The longest match wins (/manager/next-term/fees over /manager/next-term).
      if (hit && (!best || s.to.length > best.length || (s.to.length === best.length && si === liveStage))) best = { stage: si, screen: i, length: s.to.length }
    }),
  )
  return best && { stage: best.stage, screen: best.screen }
}

/**
 * The Staff's work through a Term, with the same stages as the Manager's (termJourney keys). Staff prepare the
 * Rooms and codes before check-in, run the desk, then the daily work of the stay and the turnover to the next Term.
 */
export const STAFF_STAGES = [
  {
    key: 'registration',
    label: 'Registration',
    why: 'Students are applying: get the block’s rooms, beds and furniture right before beds are given out.',
    screens: [
      { to: '/staff/inventory', daily: true, label: 'Rooms and beds', why: 'Take broken beds and rooms out of service so nobody is placed in them.' },
      { to: '/staff/furniture', daily: true, label: 'Furniture', why: 'A room’s class depends on its furniture; record what each room really has.' },
    ],
  },
  {
    key: 'assignment',
    label: 'Review and assignment',
    why: 'Students are being placed: every room that will be used needs a door code ready.',
    screens: [
      { to: '/staff/inventory', daily: true, label: 'Rooms and beds', why: 'Rooms out of service are left out of the assignment.' },
      { to: '/staff/door-codes', daily: true, label: 'Door codes', why: 'Set each room’s code and confirm it on the lock; codes are only released once confirmed.' },
    ],
  },
  {
    key: 'payment',
    label: 'Balance payment',
    why: 'Residents pay their balance; their door code is released when they have paid and the code is confirmed.',
    screens: [{ to: '/staff/door-codes', daily: true, label: 'Door codes', why: 'A code waiting to be confirmed on the lock holds back paid residents.' }],
  },
  {
    key: 'checkin',
    label: 'Check-in',
    why: 'Residents move in at the desk; hand over the items and note anything missing.',
    screens: [
      { to: '/staff/check-in', label: 'Check-in', why: 'Look up the resident by code, name or QR pass and hand over the items.' },
      { to: '/staff/door-codes', daily: true, label: 'Door codes', why: 'Residents without a code yet are waiting on a confirmation here.' },
    ],
  },
  {
    key: 'stay',
    label: 'Living in',
    why: 'Daily work for residents, then the move to the next term: requests, meter readings and check-outs.',
    screens: [
      { to: '/staff/maintenance', daily: true, label: 'Maintenance', why: 'Requests have a time limit; overdue ones go to a manager.' },
      { to: '/staff/inspections', daily: true, label: 'Inspections', why: 'Scheduled room checks set by the manager.' },
      { to: '/staff/meter-readings', daily: true, label: 'Meter readings', why: 'Monthly readings become the residents’ utility invoices.' },
      { to: '/staff/next-term', label: 'Term transition', why: 'Next-term requests of your block: room changes, swaps, room tiers and extensions.' },
      { to: '/staff/room-changes', label: 'Room changes and swaps', why: 'Decide moves inside your block.' },
      { to: '/staff/check-out', label: 'Check-out', why: 'Final meter reading, condition and damage per item, keys back; the door code is rotated after.' },
    ],
  },
]
