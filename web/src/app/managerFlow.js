/*
 * The Manager's and the Staff's flows through a Term, in the order it happens (spec §5, §6.6–§6.12): the stages are those of
 * termJourney (same keys and dates), and each stage lists its screens in the order to use them. The Overview
 * shows what the current stage asks for; every screen of the flow shows where it sits (FlowTrail).
 */

export const MANAGER_STAGES = [
  {
    key: 'registration',
    label: 'Registration',
    why: 'Students apply and pay their Deposit; their accounts must be verified before they can apply.',
    screens: [
      { to: '/manager/term-requests', label: 'Period requests', why: 'Ask the Admin to open the Term with its dates, Rooms, places and prices.' },
      { to: '/manager/student-import', label: 'Import student list', why: 'The enrolled list verifies students’ accounts, so they can apply.' },
      { to: '/manager/students', daily: true, label: 'Students', why: 'Verify the accounts still waiting and look up any student.' },
      { to: '/manager/applications', label: 'Applications', why: 'Review Applications as they come in; only reviewed ones go into the assignment.' },
    ],
  },
  {
    key: 'assignment',
    label: 'Review and assignment',
    why: 'Every Application is decided, then the assignment places students in Beds Block by Block.',
    screens: [
      { to: '/manager/applications', label: 'Applications', why: 'Finish the review: the assignment only takes approved Applications.' },
      { to: '/manager/room-classes', label: 'Room Classes by Term', why: 'Set each Room’s class for the Term before Beds are given out; prices follow it.' },
      { to: '/manager/assignment', label: 'Assignment', why: 'Run it, resolve the conflicts it flags, then commit each Block; Round 2 offers the Beds left.' },
    ],
  },
  {
    key: 'payment',
    label: 'Balance payment',
    why: 'Placed students pay their Balance; unpaid Balances past the deadline lose their Bed.',
    screens: [
      { to: '/manager/payment-claims', daily: true, label: 'Payment confirmations', why: 'Students’ deadlines stop while their transfer waits for you: confirm or reject each one.' },
      { to: '/manager/payments', daily: true, label: 'Payments', why: 'Every Invoice of the Term and what is still unpaid.' },
      { to: '/manager/finance', daily: true, label: 'Collections and refunds', why: 'Send reminders and decide refunds.' },
    ],
  },
  {
    key: 'checkin',
    label: 'Check-in',
    why: 'Paid residents receive their door code and move in; late arrivals need a decision.',
    screens: [
      { to: '/manager/door-codes', daily: true, label: 'Door codes', why: 'Codes are released to paid residents once the lock is confirmed.' },
      { to: '/manager/approvals', daily: true, label: 'Decisions', why: 'Late check-ins and other requests that need a Manager.' },
    ],
  },
  {
    key: 'stay',
    label: 'Living in',
    why: 'Residents live in; before the Term ends the next one is prepared: requests, enrollment, fees and turnover.',
    screens: [
      { to: '/manager/next-term', label: 'Term transition', why: 'The requests window: room changes, swaps, Room Classes, extensions and end of stay for next Term.' },
      { to: '/manager/room-changes', label: 'Room changes and swaps', why: 'Decide moves across Blocks; Staff decide those inside one Block.' },
      { to: '/manager/reconciliation', label: 'Reconciliation', why: 'Residents not enrolled next Term lose their next-Term Bed before fees are issued.' },
      { to: '/manager/next-term/fees', label: 'Next-Term fees', why: 'One fee per continuing resident; unpaid by the deadline, the Bed is released.' },
      { to: '/manager/terminations', daily: true, label: 'Terminations', why: 'End a stay early for debt, enrollment or a Manager decision.' },
    ],
  },
]

/**
 * Where a path sits in the Manager's flow ({ stage, screen }), or null for ongoing work outside it. A screen used in
 * two stages (Applications) is placed in the Term's current stage when it belongs there.
 */
export function managerPosition(pathname, liveStage = -1) {
  return stagePosition(MANAGER_STAGES, pathname, liveStage)
}

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
    why: 'Students are applying: get the Block’s Rooms, Beds and furniture right before Beds are given out.',
    screens: [
      { to: '/staff/inventory', daily: true, label: 'Rooms and Beds', why: 'Take broken Beds and Rooms out of service so nobody is placed in them.' },
      { to: '/staff/furniture', daily: true, label: 'Furniture', why: 'A Room’s class depends on its furniture; record what each Room really has.' },
    ],
  },
  {
    key: 'assignment',
    label: 'Review and assignment',
    why: 'Students are being placed: every Room that will be used needs a door code ready.',
    screens: [
      { to: '/staff/inventory', daily: true, label: 'Rooms and Beds', why: 'Rooms out of service are left out of the assignment.' },
      { to: '/staff/door-codes', daily: true, label: 'Door codes', why: 'Set each Room’s code and confirm it on the lock; codes are only released once confirmed.' },
    ],
  },
  {
    key: 'payment',
    label: 'Balance payment',
    why: 'Residents pay their Balance; their door code is released when they have paid and the code is confirmed.',
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
    why: 'Daily work for residents, then the move to the next Term: requests, meter readings and check-outs.',
    screens: [
      { to: '/staff/maintenance', daily: true, label: 'Maintenance', why: 'Requests have a time limit; overdue ones go to a Manager.' },
      { to: '/staff/inspections', daily: true, label: 'Inspections', why: 'Scheduled Room checks set by the Manager.' },
      { to: '/staff/meter-readings', daily: true, label: 'Meter readings', why: 'Monthly readings become the residents’ Utility Invoices.' },
      { to: '/staff/next-term', label: 'Term transition', why: 'Next-Term requests of your Block: room changes, swaps, Room Classes and extensions.' },
      { to: '/staff/room-changes', label: 'Room changes and swaps', why: 'Decide moves inside your Block.' },
      { to: '/staff/check-out', label: 'Check-out', why: 'Final meter reading, condition and damage per item, keys back; the door code is rotated after.' },
    ],
  },
]
