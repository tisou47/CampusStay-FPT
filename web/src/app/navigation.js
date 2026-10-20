import {
  Banknote,
  Bed,
  Bell,
  Building,
  Calendar,
  ChartColumn,
  Check,
  CircleCheck,
  CreditCard,
  FileText,
  Layers,
  LayoutDashboard,
  LogIn,
  Repeat,
  SlidersHorizontal,
  TriangleAlert,
  User,
  Users,
  Wrench,
} from 'lucide-react'

/** A nav item is active on its own path, any sub-path, and any extra `match` prefixes. */
export function isNavActive(item, pathname) {
  if (item.end) return pathname === item.to
  return [item.to, ...(item.match ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// Shell/Student Top Bar — Home, Application, My Room, Payments, Requests.
export const studentNav = [
  { label: 'Home', to: '/student', end: true },
  { label: 'Application', to: '/student/applications', match: ['/student/apply', '/student/roommate-invitation', '/student/round-2-offer'] },
  { label: 'My Room', to: '/student/room' },
  { label: 'Payments', to: '/student/invoices' },
  { label: 'Requests', to: '/student/requests' },
]


// Shell/Sidebar (back office) — menus match the sidebar map in the Screen Inventory doc.
// Staff and Manager see a Block scope selector built from the Blocks assigned to them; Admin sees every Block.
export const backOffice = {
  staff: {
    portal: 'Staff portal',
    itemHeight: 'h-10',
    sections: [
      {
        items: [
          { label: 'Dashboard', icon: LayoutDashboard, to: '/staff', end: true },
          { label: 'Applications', icon: FileText, to: '/staff/applications' },
          { label: 'Assignment', icon: Layers, to: '/staff/assignment' },
          { label: 'Residents', icon: Users, to: '/staff/residents' },
          { label: 'Inventory', icon: Building, to: '/staff/inventory' },
          { label: 'Payments', icon: CreditCard, to: '/staff/payments' },
          { label: 'Meter Readings', icon: ChartColumn, to: '/staff/meter-readings' },
          { label: 'Maintenance', icon: Wrench, to: '/staff/maintenance' },
          { label: 'Inspections', icon: CircleCheck, to: '/staff/inspections' },
          { label: 'Room Changes', icon: Repeat, to: '/staff/room-changes' },
          { label: 'Check-in / Check-out', icon: LogIn, to: '/staff/check-in', match: ['/staff/check-out'] },
        ],
      },
    ],
  },
  manager: {
    portal: 'Manager portal',
    itemHeight: 'h-10',
    sections: [
      {
        items: [
          { label: 'Dashboard', icon: LayoutDashboard, to: '/manager', end: true },
          { label: 'Approvals', icon: Check, to: '/manager/approvals' },
          { label: 'Applications', icon: FileText, to: '/manager/applications' },
          { label: 'Residents', icon: Users, to: '/manager/residents' },
          { label: 'Inventory', icon: Building, to: '/manager/inventory' },
          { label: 'Maintenance', icon: Wrench, to: '/manager/maintenance' },
          { label: 'Inspections', icon: CircleCheck, to: '/manager/inspections' },
        ],
      },
      {
        title: 'Management',
        items: [
          { label: 'Finance', icon: Banknote, to: '/manager/finance' },
          { label: 'Staff', icon: Users, to: '/manager/staff' },
          { label: 'Routing Rules', icon: SlidersHorizontal, to: '/manager/routing-rules' },
          { label: 'Escalations', icon: TriangleAlert, to: '/manager/escalations' },
          { label: 'Reports', icon: ChartColumn, to: '/manager/reports' },
          { label: 'Block Settings', icon: SlidersHorizontal, to: '/manager/block-settings' },
        ],
      },
    ],
  },
  admin: {
    portal: 'Admin console',
    itemHeight: 'h-9',
    sections: [
      { items: [{ label: 'Dashboard', icon: LayoutDashboard, to: '/admin', end: true }] },
      {
        title: 'Configuration',
        items: [
          { label: 'Terms and Windows', icon: Calendar, to: '/admin/terms' },
          { label: 'Room Types', icon: Bed, to: '/admin/room-types' },
          { label: 'Room Classes', icon: Layers, to: '/admin/room-classes' },
          { label: 'Fees and Refunds', icon: Banknote, to: '/admin/fees' },
          { label: 'Utility', icon: Banknote, to: '/admin/utility' },
          { label: 'Eligibility Rules', icon: CircleCheck, to: '/admin/eligibility' },
          { label: 'Matching Criteria', icon: Users, to: '/admin/matching' },
          { label: 'Inspection Checklists', icon: CircleCheck, to: '/admin/inspection-checklists' },
          { label: 'Notifications', icon: Bell, to: '/admin/notifications' },
          { label: 'System Parameters', icon: SlidersHorizontal, to: '/admin/system-parameters' },
        ],
      },
      {
        title: 'Operations',
        items: [
          { label: 'Buildings', icon: Building, to: '/admin/buildings' },
          { label: 'Users and Roles', icon: User, to: '/admin/users' },
        ],
      },
      {
        title: 'Reports',
        items: [
          { label: 'Occupancy Report', icon: ChartColumn, to: '/admin/reports/occupancy' },
          { label: 'Financial Report', icon: ChartColumn, to: '/admin/reports/financial' },
          { label: 'Audit Log', icon: FileText, to: '/admin/audit-log' },
        ],
      },
    ],
  },
}

