import {
  ArrowRightLeft,
  Banknote,
  Bed,
  Bell,
  Building,
  Calendar,
  CalendarClock,
  CalendarRange,
  ChartColumn,
  Check,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileSearch,
  FileText,
  Gauge,
  GraduationCap,
  HandCoins,
  Hourglass,
  House,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Megaphone,
  Package,
  Repeat,
  RotateCcw,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  TriangleAlert,
  Upload,
  User,
  Users,
  Wrench,
} from 'lucide-react'

/*
 * Menus of every portal (Change Specification v2 §11.2). Labels are English keys, shown with t() where they are
 * drawn. Back-office menus are grouped by the work they belong to; Staff work for their Blocks, Managers for
 * every Block (ADR-19). Items for screens of later phases are added when those screens exist.
 */

/** A nav item is active on its own path, any sub-path, and any extra `match` prefixes. */
/**
 * A menu item is active on its own path, the paths in `match`, and the screens of its `tabs` (screens joined under
 * one entry and switched with the tab strip above the page, SectionTabs); `exclude` keeps a deeper path that has
 * its own entry (Next-Term fees under Term transition).
 */
export function isNavActive(item, pathname) {
  if (item.end) return pathname === item.to
  const under = (p) => pathname === p || pathname.startsWith(`${p}/`)
  if ((item.exclude ?? []).some(under)) return false
  return [item.to, ...(item.match ?? []), ...(item.tabs ?? []).map((tab) => tab.to)].some(under)
}

/** The menu item whose tabs hold this path, for the tab strip above the page; null when the page stands alone. */
export function tabGroupFor(role, pathname) {
  const items = backOffice[role]?.sections.flatMap((s) => s.items) ?? []
  return items.find((item) => item.tabs && item.tabs.some((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`))) ?? null
}

// Student top bar: Home, Registration, My Room, Payments, Requests.
export const studentNav = [
  { label: 'Home', to: '/student', end: true },
  { label: 'Registration', to: '/student/applications', match: ['/student/apply', '/student/roommate-invitation', '/student/round-2-offer'] },
  { label: 'My Room', to: '/student/room' },
  { label: 'Payments', to: '/student/invoices' },
  { label: 'Requests', to: '/student/requests' },
]

// Phone width: Home, My Room, Payments, Activity (Registration and Requests), as on Android.
export const studentTabs = [
  { label: 'Home', icon: House, to: '/student', end: true },
  { label: 'My Room', icon: Bed, to: '/student/room' },
  { label: 'Payments', icon: CreditCard, to: '/student/invoices' },
  {
    label: 'Activity',
    icon: FileText,
    to: '/student/applications',
    match: ['/student/apply', '/student/roommate-invitation', '/student/round-2-offer', '/student/requests'],
  },
]

export const backOffice = {
  staff: {
    portal: 'Staff portal',
    roleTitle: 'Block Staff',
    sections: [
      { items: [{ label: 'Today', icon: LayoutDashboard, to: '/staff', end: true }] },
      {
        title: 'Desk',
        items: [
          { label: 'Check-in', icon: LogIn, to: '/staff/check-in' },
          { label: 'Check-out', icon: LogOut, to: '/staff/check-out' },
        ],
      },
      {
        title: 'Residents',
        items: [
          { label: 'Students', icon: GraduationCap, to: '/staff/students' },
          { label: 'Term transition', icon: CalendarClock, to: '/staff/next-term' },
          { label: 'Room changes and swaps', icon: Repeat, to: '/staff/room-changes' },
        ],
      },
      {
        title: 'Rooms',
        items: [
          { label: 'Rooms and Beds', icon: Building, to: '/staff/inventory' },
          { label: 'Door codes', icon: KeyRound, to: '/staff/door-codes' },
          { label: 'Furniture', icon: Package, to: '/staff/furniture' },
          { label: 'Operational moves', icon: ArrowRightLeft, to: '/staff/moves' },
        ],
      },
      {
        title: 'Operations',
        items: [
          { label: 'Maintenance', icon: Wrench, to: '/staff/maintenance' },
          { label: 'Inspections', icon: ClipboardCheck, to: '/staff/inspections' },
          { label: 'Meter readings', icon: Gauge, to: '/staff/meter-readings' },
        ],
      },
      { items: [{ label: 'Announcements', icon: Megaphone, to: '/staff/announcements' }] },
    ],
  },
  manager: {
    portal: 'Manager portal',
    roleTitle: 'Dormitory Manager',
    sections: [
      { items: [{ label: 'Overview', icon: LayoutDashboard, to: '/manager', end: true }] },
      {
        title: 'Registration',
        items: [
          { label: 'Period requests', icon: ClipboardList, to: '/manager/term-requests' },
          { label: 'Term dashboard', icon: CalendarRange, to: '/manager/terms' },
          { label: 'Applications', icon: FileText, to: '/manager/applications' },
          { label: 'Assignment', icon: Layers, to: '/manager/assignment' },
        ],
      },
      {
        title: 'Residents',
        items: [
          {
            label: 'Students',
            icon: GraduationCap,
            to: '/manager/students',
            tabs: [
              { label: 'Students', to: '/manager/students' },
              { label: 'Import student list', to: '/manager/student-import' },
            ],
          },
          { label: 'Reconciliation', icon: FileSearch, to: '/manager/reconciliation' },
          { label: 'Term transition', icon: CalendarClock, to: '/manager/next-term', exclude: ['/manager/next-term/fees'] },
          {
            label: 'Decisions',
            icon: Check,
            to: '/manager/approvals',
            tabs: [
              { label: 'Decisions', to: '/manager/approvals' },
              { label: 'Terminations', to: '/manager/terminations' },
            ],
          },
          {
            label: 'Moves',
            icon: Repeat,
            to: '/manager/room-changes',
            tabs: [
              { label: 'Room changes and swaps', to: '/manager/room-changes' },
              { label: 'Operational moves', to: '/manager/moves' },
            ],
          },
        ],
      },
      {
        title: 'Finance',
        items: [
          {
            label: 'Payments',
            icon: HandCoins,
            to: '/manager/payment-claims',
            tabs: [
              { label: 'Payment confirmations', to: '/manager/payment-claims' },
              { label: 'Payments', to: '/manager/payments' },
              { label: 'Collections and refunds', to: '/manager/finance' },
            ],
          },
          { label: 'Next-Term fees', icon: Banknote, to: '/manager/next-term/fees' },
        ],
      },
      {
        title: 'Operations',
        items: [
          { label: 'Overdue requests', icon: TriangleAlert, to: '/manager/escalations' },
          { label: 'Maintenance', icon: Wrench, to: '/manager/maintenance' },
          { label: 'Inspection schedules', icon: ClipboardCheck, to: '/manager/inspections' },
          {
            label: 'Block settings',
            icon: Settings,
            to: '/manager/block-settings',
            tabs: [
              { label: 'House rules', to: '/manager/block-settings' },
              { label: 'Routing and timers', to: '/manager/routing-rules' },
            ],
          },
        ],
      },
      {
        title: 'Inventory',
        items: [
          { label: 'Rooms and Beds', icon: Building, to: '/manager/inventory' },
          { label: 'Room Classes by Term', icon: Layers, to: '/manager/room-classes' },
          { label: 'Furniture', icon: Package, to: '/manager/furniture' },
          { label: 'Door codes', icon: KeyRound, to: '/manager/door-codes' },
        ],
      },
      {
        title: 'People',
        items: [
          {
            label: 'Staff',
            icon: Users,
            to: '/manager/staff',
            tabs: [
              { label: 'Staff and workload', to: '/manager/staff' },
              { label: 'Staff accounts', to: '/manager/staff-accounts' },
            ],
          },
        ],
      },
      { items: [{ label: 'Announcements', icon: Megaphone, to: '/manager/announcements' }] },
      {
        title: 'Reports',
        items: [{ label: 'Block reports', icon: ChartColumn, to: '/manager/reports' }],
      },
    ],
  },
  admin: {
    portal: 'Admin console',
    roleTitle: 'Administrator',
    sections: [
      { items: [{ label: 'Overview', icon: LayoutDashboard, to: '/admin', end: true }] },
      {
        title: 'Registration periods',
        items: [
          { label: 'Requests', icon: ClipboardList, to: '/admin/term-requests' },
          { label: 'Terms', icon: Calendar, to: '/admin/terms' },
        ],
      },
      {
        title: 'Prices and fees',
        items: [
          { label: 'Room Types', icon: Bed, to: '/admin/room-types' },
          { label: 'Room Classes', icon: Layers, to: '/admin/room-classes' },
          { label: 'Deposit', icon: Banknote, to: '/admin/fees' },
          { label: 'Utility', icon: Gauge, to: '/admin/utility' },
        ],
      },
      {
        title: 'Rules',
        items: [
          { label: 'Who may apply', icon: CircleCheck, to: '/admin/eligibility' },
          { label: 'Roommate matching', icon: Users, to: '/admin/matching' },
          { label: 'Deadlines and reminders', icon: Timer, to: '/admin/deadlines' },
          { label: 'Refunds, penalties and terminations', icon: Scale, to: '/admin/refunds' },
          { label: 'Stay and renewal', icon: Hourglass, to: '/admin/stay' },
          { label: 'Inspection checklists', icon: ClipboardCheck, to: '/admin/inspection-checklists' },
        ],
      },
      {
        title: 'Notifications',
        items: [
          { label: 'Notification texts', icon: Bell, to: '/admin/notifications', end: true },
          { label: 'Send email', icon: Mail, to: '/admin/notifications/send' },
          { label: 'Announcements', icon: Megaphone, to: '/admin/announcements' },
        ],
      },
      {
        title: 'System',
        items: [
          { label: 'Buildings and Rooms', icon: Building, to: '/admin/buildings' },
          { label: 'Furniture types', icon: Package, to: '/admin/furniture-types' },
          { label: 'Users and roles', icon: User, to: '/admin/users' },
          { label: 'Students', icon: GraduationCap, to: '/admin/students' },
          { label: 'Import student list', icon: Upload, to: '/admin/student-import' },
          { label: 'System parameters', icon: SlidersHorizontal, to: '/admin/system-parameters' },
          { label: 'Demo data', icon: RotateCcw, to: '/admin/demo' },
          { label: 'Audit Log', icon: ScrollText, to: '/admin/audit-log' },
        ],
      },
      {
        title: 'Reports',
        items: [
          { label: 'Occupancy', icon: ChartColumn, to: '/admin/reports/occupancy' },
          { label: 'Finance', icon: ShieldCheck, to: '/admin/reports/financial' },
        ],
      },
    ],
  },
}
