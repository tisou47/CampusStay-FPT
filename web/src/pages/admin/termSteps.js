/** The steps of the term wizard, shared by the wizard and the New term page (which must not load the wizard). */
export const STEPS = [
  { key: 'general', label: 'General', why: 'The term’s name and stay dates; everything else hangs on them.' },
  { key: 'timeline', label: 'Timeline', why: 'When registration opens and closes and when each later milestone falls; deadlines and reminders follow these dates.' },
  { key: 'rooms', label: 'Rooms and places', why: 'Which blocks and rooms this term offers; the assignment can only use these beds.' },
  { key: 'prices', label: 'Prices', why: 'The price of each room type and room tier for this term; fixed once published.' },
  { key: 'rules', label: 'Rules', why: 'Who may apply, who goes first and how roommates are matched for this term.' },
  { key: 'information', label: 'Information', why: 'What students read about the term on their board before they apply.' },
  { key: 'review', label: 'Review and publish', why: 'Check what is still missing, then publish: students see the term and managers are told.' },
]
