import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { RequireRole } from '@/app/session'
import { Toaster } from '@/app/toast'
import { BackOfficeLayout } from '@/components/layout/BackOfficeLayout'
import { StudentLayout } from '@/components/layout/StudentLayout'
import { ScreenIndex } from '@/dev/ScreenIndex'

import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword'
import SignIn from '@/pages/auth/SignIn'
import NotFound from '@/pages/common/NotFound'
import NotInScope from '@/pages/common/NotInScope'

// Student — 05 Web – Student
import StudentHome from '@/pages/student/StudentHome'
import ApplyTerm from '@/pages/student/apply/ApplyTerm'
import ApplyRoom from '@/pages/student/apply/ApplyRoom'
import ApplyRoommate from '@/pages/student/apply/ApplyRoommate'
import ApplyPersonal from '@/pages/student/apply/ApplyPersonal'
import ApplyReview from '@/pages/student/apply/ApplyReview'
import MyApplications from '@/pages/student/MyApplications'
import ApplicationDetail from '@/pages/student/ApplicationDetail'
import RoommateInvitation from '@/pages/student/RoommateInvitation'
import Round2Offer from '@/pages/student/Round2Offer'
import MyInvoices from '@/pages/student/MyInvoices'
import InvoicePayment from '@/pages/student/InvoicePayment'
import InvoiceDetail from '@/pages/student/InvoiceDetail'
import MyRoom from '@/pages/student/MyRoom'
import MyRequests from '@/pages/student/MyRequests'
import Notifications from '@/pages/student/Notifications'
import NewMaintenanceRequest from '@/pages/student/NewMaintenanceRequest'
import NewRoomChangeRequest from '@/pages/student/NewRoomChangeRequest'
import SwapSpecific from '@/pages/student/SwapSpecific'
import SwapBoard from '@/pages/student/SwapBoard'
import SwapInvitation from '@/pages/student/SwapInvitation'

// Staff — 06 Web – Staff
import StaffDashboard from '@/pages/staff/StaffDashboard'
import ApplicationQueue from '@/pages/staff/ApplicationQueue'
import ApplicationReview from '@/pages/staff/ApplicationReview'
import Payments from '@/pages/staff/Payments'
import AssignmentRuns from '@/pages/staff/AssignmentRuns'
import ProposalReview from '@/pages/staff/ProposalReview'
import Inventory from '@/pages/staff/Inventory'
import MaintenanceQueue from '@/pages/staff/MaintenanceQueue'
import MaintenanceDetail from '@/pages/staff/MaintenanceDetail'
import RoomChangeQueue from '@/pages/staff/RoomChangeQueue'
import SwapRequests from '@/pages/staff/SwapRequests'
import CheckInDesk from '@/pages/staff/CheckInDesk'
import CheckOutDesk from '@/pages/staff/CheckOutDesk'
import MeterReadings from '@/pages/staff/MeterReadings'
import InspectionChecklist from '@/pages/staff/InspectionChecklist'

// Manager — 07 Web – Manager
import ManagerDashboard from '@/pages/manager/ManagerDashboard'
import Approvals from '@/pages/manager/Approvals'
import BlockFinance from '@/pages/manager/BlockFinance'
import BlockStaff from '@/pages/manager/BlockStaff'
import RoutingRules from '@/pages/manager/RoutingRules'
import Escalations from '@/pages/manager/Escalations'
import BlockReports from '@/pages/manager/BlockReports'
import BlockSettings from '@/pages/manager/BlockSettings'
import InspectionSchedule from '@/pages/manager/InspectionSchedule'

// Admin — 08 Web – Admin
import AdminDashboard from '@/pages/admin/AdminDashboard'
import TermsWindows from '@/pages/admin/TermsWindows'
import RoomTypes from '@/pages/admin/RoomTypes'
import RoomClasses from '@/pages/admin/RoomClasses'
import FeesRules from '@/pages/admin/FeesRules'
import UtilitySettings from '@/pages/admin/UtilitySettings'
import EligibilityRules from '@/pages/admin/EligibilityRules'
import MatchingCriteria from '@/pages/admin/MatchingCriteria'
import InspectionChecklists from '@/pages/admin/InspectionChecklists'
import NotificationTemplates from '@/pages/admin/NotificationTemplates'
import SendEmail from '@/pages/admin/SendEmail'
import SystemParameters from '@/pages/admin/SystemParameters'
import Buildings from '@/pages/admin/Buildings'
import UsersRoles from '@/pages/admin/UsersRoles'
import OccupancyReport from '@/pages/admin/OccupancyReport'
import FinancialReport from '@/pages/admin/FinancialReport'
import AuditLog from '@/pages/admin/AuditLog'

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
      {import.meta.env.DEV && <ScreenIndex />}
    </>
  )
}

/** A portal: role guard → layout → pages. */
function portal(role, layout, children) {
  return { path: role, element: <RequireRole role={role} />, children: [{ element: layout, children }] }
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/signin" replace /> },
      { path: 'signin', element: <SignIn /> },
      // Public pages opened from emails (contract C-13): /reset-password?token=… and /set-password?token=…
      { path: 'forgot-password', element: <ForgotPassword /> },
      { path: 'reset-password', element: <ResetPassword mode="reset" /> },
      { path: 'set-password', element: <ResetPassword mode="invite" /> },

      portal('student', <StudentLayout />, [
        { index: true, element: <StudentHome /> },
        { path: 'apply', element: <Navigate to="/student/apply/term" replace /> },
        { path: 'apply/term', element: <ApplyTerm /> },
        { path: 'apply/room', element: <ApplyRoom /> },
        { path: 'apply/roommate', element: <ApplyRoommate /> },
        { path: 'apply/personal', element: <ApplyPersonal /> },
        { path: 'apply/review', element: <ApplyReview /> },
        { path: 'applications', element: <MyApplications /> },
        { path: 'applications/:id', element: <ApplicationDetail /> },
        { path: 'roommate-invitation', element: <RoommateInvitation /> },
        { path: 'round-2-offer', element: <Round2Offer /> },
        { path: 'invoices', element: <MyInvoices /> },
        { path: 'invoices/:id', element: <InvoiceDetail /> },
        { path: 'invoices/:id/pay', element: <InvoicePayment /> },
        { path: 'room', element: <MyRoom /> },
        { path: 'requests', element: <MyRequests /> },
        { path: 'requests/maintenance/new', element: <NewMaintenanceRequest /> },
        { path: 'requests/room-change/new', element: <NewRoomChangeRequest /> },
        { path: 'requests/swap/new', element: <SwapSpecific /> },
        { path: 'requests/swap/board', element: <SwapBoard /> },
        { path: 'requests/swap/invitations/:id', element: <SwapInvitation /> },
        { path: 'notifications', element: <Notifications /> },
      ]),

      portal('staff', <BackOfficeLayout role="staff" />, [
        { index: true, element: <StaffDashboard /> },
        { path: 'applications', element: <ApplicationQueue /> },
        { path: 'applications/:id', element: <ApplicationReview /> },
        { path: 'assignment', element: <AssignmentRuns /> },
        { path: 'assignment/:runId', element: <ProposalReview /> },
        { path: 'residents', element: <NotInScope title="Residents" /> },
        { path: 'inventory', element: <Inventory /> },
        { path: 'payments', element: <Payments /> },
        { path: 'meter-readings', element: <MeterReadings /> },
        { path: 'maintenance', element: <MaintenanceQueue /> },
        { path: 'maintenance/:id', element: <MaintenanceDetail /> },
        { path: 'inspections', element: <InspectionChecklist /> },
        { path: 'room-changes', element: <RoomChangeQueue /> },
        { path: 'room-changes/swaps', element: <SwapRequests /> },
        { path: 'check-in', element: <CheckInDesk /> },
        { path: 'check-out', element: <CheckOutDesk /> },
      ]),

      portal('manager', <BackOfficeLayout role="manager" />, [
        { index: true, element: <ManagerDashboard /> },
        { path: 'approvals', element: <Approvals tab="assignment" /> },
        { path: 'approvals/late-check-in', element: <Approvals tab="late-check-in" /> },
        // Manager shares the Staff work queues for its Block.
        { path: 'applications', element: <ApplicationQueue /> },
        { path: 'applications/:id', element: <ApplicationReview /> },
        { path: 'residents', element: <NotInScope title="Residents" /> },
        { path: 'inventory', element: <Inventory /> },
        { path: 'maintenance', element: <MaintenanceQueue /> },
        { path: 'maintenance/:id', element: <MaintenanceDetail /> },
        { path: 'inspections', element: <InspectionSchedule /> },
        { path: 'finance', element: <BlockFinance /> },
        { path: 'staff', element: <BlockStaff /> },
        { path: 'routing-rules', element: <RoutingRules /> },
        { path: 'escalations', element: <Escalations /> },
        { path: 'reports', element: <BlockReports /> },
        { path: 'block-settings', element: <BlockSettings /> },
      ]),

      portal('admin', <BackOfficeLayout role="admin" />, [
        { index: true, element: <AdminDashboard /> },
        { path: 'terms', element: <TermsWindows /> },
        { path: 'room-types', element: <RoomTypes /> },
        { path: 'room-classes', element: <RoomClasses /> },
        { path: 'fees', element: <FeesRules /> },
        { path: 'utility', element: <UtilitySettings /> },
        { path: 'eligibility', element: <EligibilityRules /> },
        { path: 'matching', element: <MatchingCriteria /> },
        { path: 'inspection-checklists', element: <InspectionChecklists /> },
        { path: 'notifications', element: <NotificationTemplates /> },
        { path: 'notifications/send', element: <SendEmail /> },
        { path: 'system-parameters', element: <SystemParameters /> },
        { path: 'buildings', element: <Buildings /> },
        { path: 'users', element: <UsersRoles /> },
        { path: 'reports/occupancy', element: <OccupancyReport /> },
        { path: 'reports/financial', element: <FinancialReport /> },
        { path: 'audit-log', element: <AuditLog /> },
      ]),

      { path: '*', element: <NotFound /> },
    ],
  },
])
