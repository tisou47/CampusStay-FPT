/*
 * Screen inventory — the web frames of the Figma file "CampusStay-FPT" (UI design v0.5) and the
 * routes that implement them. Used by the development screen index (Alt+D, dev builds only).
 * Detail screens (/…/:id) open from their lists and are not listed here.
 */
export const roles = {
  student: { label: 'Student', figmaPage: '05 Web – Student' },
  staff: { label: 'Staff', figmaPage: '06 Web – Staff' },
  manager: { label: 'Manager', figmaPage: '07 Web – Manager' },
  admin: { label: 'Admin', figmaPage: '08 Web – Admin' },
}

export const screens = [
  // 05 Web – Student
  { code: 'SCR-AUTH-01', title: 'Sign In', role: 'student', path: '/signin' },
  { code: 'SCR-AUTH-02', title: 'Forgot password', role: 'student', path: '/forgot-password' },
  { code: 'SCR-AUTH-03', title: 'Reset password (from the email link)', role: 'student', path: '/reset-password?token=preview' },
  { code: 'SCR-AUTH-04', title: 'Set password (invitation link)', role: 'student', path: '/set-password?token=preview' },
  { code: 'SCR-HOME-01', title: 'Student Home', role: 'student', path: '/student' },
  { code: 'SCR-APP-01', title: 'Application Wizard – 1 Term and eligibility', role: 'student', path: '/student/apply/term' },
  { code: 'SCR-APP-01', title: 'Application Wizard – 2 Room preference', role: 'student', path: '/student/apply/room' },
  { code: 'SCR-APP-01', title: 'Application Wizard – Roommate (2-bed)', role: 'student', path: '/student/apply/roommate' },
  { code: 'SCR-APP-01', title: 'Application Wizard – 3 Personal info', role: 'student', path: '/student/apply/personal' },
  { code: 'SCR-APP-01', title: 'Application Wizard – 4 Review and submit', role: 'student', path: '/student/apply/review' },
  { code: 'SCR-APP-02', title: 'My Applications', role: 'student', path: '/student/applications' },
  { code: 'SCR-APP-04', title: 'Roommate Invitation', role: 'student', path: '/student/roommate-invitation' },
  { code: 'SCR-ASG-02', title: 'Round 2 Offer', role: 'student', path: '/student/round-2-offer' },
  { code: 'SCR-BIL-01', title: 'My Invoices', role: 'student', path: '/student/invoices' },
  { code: 'SCR-ASG-01', title: 'My Room', role: 'student', path: '/student/room' },
  { code: 'SCR-MNT-01', title: 'My Requests', role: 'student', path: '/student/requests' },
  { code: 'MOB-NTF-01', title: 'Notifications (phone bell)', role: 'student', path: '/student/notifications' },
  { code: 'SCR-MNT-02', title: 'New Maintenance Request', role: 'student', path: '/student/requests/maintenance/new' },
  { code: 'SCR-REQ-02', title: 'New Room-Change Request', role: 'student', path: '/student/requests/room-change/new' },
  { code: 'SCR-REQ-03', title: 'Room Swap – Specific Student', role: 'student', path: '/student/requests/swap/new' },
  { code: 'SCR-REQ-04', title: 'Swap Board', role: 'student', path: '/student/requests/swap/board' },

  // 06 Web – Staff
  { code: 'SCR-HOME-02', title: 'Staff Dashboard', role: 'staff', path: '/staff' },
  { code: 'SCR-INV-10', title: 'Room and Bed Inventory', role: 'staff', path: '/staff/inventory' },
  { code: 'SCR-MNT-10', title: 'Maintenance Queue', role: 'staff', path: '/staff/maintenance' },
  { code: 'SCR-REQ-10', title: 'Room-Change Queue', role: 'staff', path: '/staff/room-changes' },
  { code: 'SCR-REQ-13', title: 'Room Swap Requests', role: 'staff', path: '/staff/room-changes/swaps' },
  { code: 'SCR-REQ-11', title: 'Check-in Desk', role: 'staff', path: '/staff/check-in' },
  { code: 'SCR-REQ-12', title: 'Check-out Desk', role: 'staff', path: '/staff/check-out' },
  { code: 'SCR-UTL-10', title: 'Meter Readings', role: 'staff', path: '/staff/meter-readings' },
  { code: 'SCR-MNT-12', title: 'Inspection Checklist', role: 'staff', path: '/staff/inspections' },

  // 07 Web – Manager
  { code: 'SCR-HOME-03', title: 'Manager Dashboard', role: 'manager', path: '/manager' },
  { code: 'SCR-APP-10', title: 'Application Queue', role: 'manager', path: '/manager/applications' },
  { code: 'SCR-ASG-10', title: 'Assignment Runs', role: 'manager', path: '/manager/assignment' },
  { code: 'SCR-BIL-10', title: 'Payments', role: 'manager', path: '/manager/payments' },
  { code: 'SCR-REQ-20', title: 'Decisions (late check-in, swaps, refunds)', role: 'manager', path: '/manager/approvals' },
  { code: 'SCR-MNT-20', title: 'Inspection Schedule', role: 'manager', path: '/manager/inspections' },
  { code: 'SCR-BIL-20', title: 'Block Finance', role: 'manager', path: '/manager/finance' },
  { code: 'SCR-AUTH-10', title: 'Block Staff', role: 'manager', path: '/manager/staff' },
  { code: 'SCR-REQ-20', title: 'Request Routing Rules', role: 'manager', path: '/manager/routing-rules' },
  { code: 'SCR-REQ-21', title: 'Escalations', role: 'manager', path: '/manager/escalations' },
  { code: 'SCR-RPT-10', title: 'Block Reports', role: 'manager', path: '/manager/reports' },
  { code: 'SCR-CFG-20', title: 'Block Settings', role: 'manager', path: '/manager/block-settings' },

  // 08 Web – Admin
  { code: 'SCR-HOME-04', title: 'Admin Dashboard', role: 'admin', path: '/admin' },
  { code: 'SCR-CFG-01', title: 'Terms and Windows', role: 'admin', path: '/admin/terms' },
  { code: 'SCR-CFG-02', title: 'Room Types', role: 'admin', path: '/admin/room-types' },
  { code: 'SCR-CFG-03', title: 'Room Classes', role: 'admin', path: '/admin/room-classes' },
  { code: 'SCR-CFG-04', title: 'Fees, Deposit and Refund Rules', role: 'admin', path: '/admin/fees' },
  { code: 'SCR-CFG-20', title: 'Utility', role: 'admin', path: '/admin/utility' },
  { code: 'SCR-CFG-05', title: 'Eligibility Rules', role: 'admin', path: '/admin/eligibility' },
  { code: 'SCR-CFG-06', title: 'Matching Criteria', role: 'admin', path: '/admin/matching' },
  { code: 'SCR-CFG-21', title: 'Inspection Checklists', role: 'admin', path: '/admin/inspection-checklists' },
  { code: 'SCR-CFG-07', title: 'Notification Templates', role: 'admin', path: '/admin/notifications' },
  { code: 'SCR-NTF-21', title: 'Send Email', role: 'admin', path: '/admin/notifications/send' },
  { code: 'SCR-CFG-08', title: 'System Parameters', role: 'admin', path: '/admin/system-parameters' },
  { code: 'SCR-INV-01', title: 'Buildings and Structure', role: 'admin', path: '/admin/buildings' },
  { code: 'SCR-AUTH-11', title: 'Users and Roles', role: 'admin', path: '/admin/users' },
  { code: 'SCR-RPT-01', title: 'Occupancy Report', role: 'admin', path: '/admin/reports/occupancy' },
  { code: 'SCR-RPT-02', title: 'Financial Report', role: 'admin', path: '/admin/reports/financial' },
  { code: 'SCR-AUTH-12', title: 'Audit Log', role: 'admin', path: '/admin/audit-log' },
]
