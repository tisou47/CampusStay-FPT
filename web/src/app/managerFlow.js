/*
 * The Manager's flow through a Term, in the order it happens (spec §5, §6.6–§6.12): the stages are those of
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
      { to: '/manager/students', label: 'Students', why: 'Verify the accounts still waiting and look up any student.' },
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
      { to: '/manager/payment-claims', label: 'Payment confirmations', why: 'Students’ deadlines stop while their transfer waits for you: confirm or reject each one.' },
      { to: '/manager/payments', label: 'Payments', why: 'Every Invoice of the Term and what is still unpaid.' },
      { to: '/manager/finance', label: 'Collections and refunds', why: 'Send reminders and decide refunds.' },
    ],
  },
  {
    key: 'checkin',
    label: 'Check-in',
    why: 'Paid residents receive their door code and move in; late arrivals need a decision.',
    screens: [
      { to: '/manager/door-codes', label: 'Door codes', why: 'Codes are released to paid residents once the lock is confirmed.' },
      { to: '/manager/approvals', label: 'Decisions', why: 'Late check-ins and other requests that need a Manager.' },
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
      { to: '/manager/terminations', label: 'Terminations', why: 'End a stay early for debt, enrollment or a Manager decision.' },
    ],
  },
]

/**
 * Where a path sits in the Manager's flow ({ stage, screen }), or null for ongoing work outside it. A screen used in
 * two stages (Applications) is placed in the Term's current stage when it belongs there.
 */
export function managerPosition(pathname, liveStage = -1) {
  let best = null
  MANAGER_STAGES.forEach((stage, si) =>
    stage.screens.forEach((s, i) => {
      const hit = pathname === s.to || pathname.startsWith(`${s.to}/`)
      // The longest match wins (/manager/next-term/fees over /manager/next-term).
      if (hit && (!best || s.to.length > best.length || (s.to.length === best.length && si === liveStage))) best = { stage: si, screen: i, length: s.to.length }
    }),
  )
  return best && { stage: best.stage, screen: best.screen }
}
