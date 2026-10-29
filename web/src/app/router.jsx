import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { RequireRole } from '@/app/session'
import { Toaster } from '@/app/toast'
import { BackOfficeLayout } from '@/components/layout/BackOfficeLayout'
import { StudentLayout } from '@/components/layout/StudentLayout'
import { LoadingState } from '@/components/ui/States'
import { ScreenIndex } from '@/dev/ScreenIndex'

// Sign-in and the pages opened from emails are in the first chunk; every other page loads on its first visit.

import FirstPassword from '@/pages/auth/FirstPassword'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import ResetPassword from '@/pages/auth/ResetPassword'
import SignIn from '@/pages/auth/SignIn'
import NotFound from '@/pages/common/NotFound'
const Announcements = () => import('@/pages/common/Announcements')
const TermRequests = () => import('@/pages/registration/TermRequests')

// Student — 05 Web – Student
const StudentHome = () => import('@/pages/student/StudentHome')
const ApplyTerm = () => import('@/pages/student/apply/ApplyTerm')
const ApplyRoom = () => import('@/pages/student/apply/ApplyRoom')
const ApplyRoommate = () => import('@/pages/student/apply/ApplyRoommate')
const ApplyPersonal = () => import('@/pages/student/apply/ApplyPersonal')
const ApplyReview = () => import('@/pages/student/apply/ApplyReview')
const MyApplications = () => import('@/pages/student/MyApplications')
const ApplicationDetail = () => import('@/pages/student/ApplicationDetail')
const RoommateInvitation = () => import('@/pages/student/RoommateInvitation')
const Round2Offer = () => import('@/pages/student/Round2Offer')
const MyInvoices = () => import('@/pages/student/MyInvoices')
const InvoicePayment = () => import('@/pages/student/InvoicePayment')
const InvoiceDetail = () => import('@/pages/student/InvoiceDetail')
const MyRoom = () => import('@/pages/student/MyRoom')
const Profile = () => import('@/pages/student/Profile')
const MyRequests = () => import('@/pages/student/MyRequests')
const Notifications = () => import('@/pages/student/Notifications')
const NewMaintenanceRequest = () => import('@/pages/student/NewMaintenanceRequest')
const NewRoomChangeRequest = () => import('@/pages/student/NewRoomChangeRequest')
const NewRoomClassChange = () => import('@/pages/student/NewRoomClassChange')
const SwapSpecific = () => import('@/pages/student/SwapSpecific')
const SwapBoard = () => import('@/pages/student/SwapBoard')
const SwapInvitation = () => import('@/pages/student/SwapInvitation')
const Verification = () => import('@/pages/student/Verification')
const RegistrationPeriod = () => import('@/pages/student/RegistrationPeriod')

// Staff — 06 Web – Staff
const StaffDashboard = () => import('@/pages/staff/StaffDashboard')
const ApplicationQueue = () => import('@/pages/staff/ApplicationQueue')
const ApplicationReview = () => import('@/pages/staff/ApplicationReview')
const Payments = () => import('@/pages/staff/Payments')
const AssignmentRuns = () => import('@/pages/staff/AssignmentRuns')
const ProposalReview = () => import('@/pages/staff/ProposalReview')
const Inventory = () => import('@/pages/staff/Inventory')
const RoomHub = () => import('@/pages/staff/RoomHub')
const DoorCodes = () => import('@/pages/staff/DoorCodes')
const Furniture = () => import('@/pages/staff/Furniture')
const RoomClassesByTerm = () => import('@/pages/manager/RoomClassesByTerm')
const MaintenanceQueue = () => import('@/pages/staff/MaintenanceQueue')
const MaintenanceDetail = () => import('@/pages/staff/MaintenanceDetail')
const RoomChangeQueue = () => import('@/pages/staff/RoomChangeQueue')
const SwapRequests = () => import('@/pages/staff/SwapRequests')
const OperationalMoves = () => import('@/pages/staff/OperationalMoves')
const TermTransition = () => import('@/pages/transition/TermTransition')
const CheckInDesk = () => import('@/pages/staff/CheckInDesk')
const CheckOutDesk = () => import('@/pages/staff/CheckOutDesk')
const MeterReadings = () => import('@/pages/staff/MeterReadings')
const InspectionChecklist = () => import('@/pages/staff/InspectionChecklist')

// Manager — 07 Web – Manager
const ManagerDashboard = () => import('@/pages/manager/ManagerDashboard')
const Approvals = () => import('@/pages/manager/Approvals')
const BlockFinance = () => import('@/pages/manager/BlockFinance')
const BlockStaff = () => import('@/pages/manager/BlockStaff')
const RoutingRules = () => import('@/pages/manager/RoutingRules')
const Escalations = () => import('@/pages/manager/Escalations')
const BlockReports = () => import('@/pages/manager/BlockReports')
const BlockSettings = () => import('@/pages/manager/BlockSettings')
const InspectionSchedule = () => import('@/pages/manager/InspectionSchedule')
const Students = () => import('@/pages/manager/Students')
const StudentHub = () => import('@/pages/manager/StudentHub')
const StudentImport = () => import('@/pages/manager/StudentImport')
const StaffAccounts = () => import('@/pages/manager/StaffAccounts')
const TermDashboard = () => import('@/pages/manager/TermDashboard')
const PaymentClaims = () => import('@/pages/manager/PaymentClaims')
const Terminations = () => import('@/pages/manager/Terminations')
const Reconciliation = () => import('@/pages/manager/Reconciliation')

// Admin — 08 Web – Admin
const AdminDashboard = () => import('@/pages/admin/AdminDashboard')
const Terms = () => import('@/pages/admin/Terms')
const TermWizard = () => import('@/pages/admin/TermWizard')
const NewTerm = () => import('@/pages/admin/NewTerm')
const Deadlines = () => import('@/pages/admin/Deadlines')
const StayRenewal = () => import('@/pages/admin/StayRenewal')
const RefundsTerminations = () => import('@/pages/admin/RefundsTerminations')
const RoomTypes = () => import('@/pages/admin/RoomTypes')
const RoomClasses = () => import('@/pages/admin/RoomClasses')
const FurnitureTypes = () => import('@/pages/admin/FurnitureTypes')
const FeesRules = () => import('@/pages/admin/FeesRules')
const UtilitySettings = () => import('@/pages/admin/UtilitySettings')
const EligibilityRules = () => import('@/pages/admin/EligibilityRules')
const MatchingCriteria = () => import('@/pages/admin/MatchingCriteria')
const InspectionChecklists = () => import('@/pages/admin/InspectionChecklists')
const NotificationTemplates = () => import('@/pages/admin/NotificationTemplates')
const SendEmail = () => import('@/pages/admin/SendEmail')
const SystemParameters = () => import('@/pages/admin/SystemParameters')
const DemoData = () => import('@/pages/admin/DemoData')
const Buildings = () => import('@/pages/admin/Buildings')
const UsersRoles = () => import('@/pages/admin/UsersRoles')
const OccupancyReport = () => import('@/pages/admin/OccupancyReport')
const FinancialReport = () => import('@/pages/admin/FinancialReport')
const AuditLog = () => import('@/pages/admin/AuditLog')

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
      {import.meta.env.DEV && <ScreenIndex />}
    </>
  )
}

/** Shown while the first page's code loads; later navigations keep the current page until the next one is ready. */
function PageLoading() {
  return <LoadingState className="min-h-screen" />
}

const RELOADED_KEY = 'campusstay-chunk-reload'

/**
 * A page loaded on its first visit, in its own chunk, so a portal does not download every other portal's screens.
 * After a deploy the old chunk names are gone: a failed load reloads the page once to get the new ones.
 */
function page(load, props) {
  return {
    lazy: async () => {
      try {
        const { default: Page } = await load()
        sessionStorage.removeItem(RELOADED_KEY)
        return { element: <Page {...props} /> }
      } catch (error) {
        if (!sessionStorage.getItem(RELOADED_KEY)) {
          sessionStorage.setItem(RELOADED_KEY, '1')
          window.location.reload()
          return new Promise(() => {})
        }
        throw error
      }
    },
  }
}

/** A portal: role guard → layout → pages. */
function portal(role, layout, children) {
  return { path: role, element: <RequireRole role={role} />, children: [{ element: layout, children }] }
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    HydrateFallback: PageLoading,
    children: [
      { index: true, element: <Navigate to="/signin" replace /> },
      { path: 'signin', element: <SignIn /> },
      // Public pages opened from emails (contract C-13): /reset-password?token=… and /set-password?token=…
      { path: 'forgot-password', element: <ForgotPassword /> },
      { path: 'reset-password', element: <ResetPassword mode="reset" /> },
      { path: 'set-password', element: <ResetPassword mode="invite" /> },
      // Signed in, before any portal: the first password of an account from Google sign-up (ADR-26).
      { path: 'account/password', element: <FirstPassword /> },

      portal('student', <StudentLayout />, [
        { index: true, ...page(StudentHome) },
        { path: 'apply', element: <Navigate to="/student/apply/term" replace /> },
        { path: 'apply/term', ...page(ApplyTerm) },
        { path: 'apply/room', ...page(ApplyRoom) },
        { path: 'apply/roommate', ...page(ApplyRoommate) },
        { path: 'apply/personal', ...page(ApplyPersonal) },
        { path: 'apply/review', ...page(ApplyReview) },
        { path: 'applications', ...page(MyApplications) },
        { path: 'applications/:id', ...page(ApplicationDetail) },
        { path: 'roommate-invitation', ...page(RoommateInvitation) },
        { path: 'round-2-offer', ...page(Round2Offer) },
        { path: 'invoices', ...page(MyInvoices) },
        { path: 'invoices/:id', ...page(InvoiceDetail) },
        { path: 'invoices/:id/pay', ...page(InvoicePayment) },
        { path: 'room', ...page(MyRoom) },
        { path: 'profile', ...page(Profile) },
        { path: 'requests', ...page(MyRequests) },
        { path: 'requests/maintenance/new', ...page(NewMaintenanceRequest) },
        { path: 'requests/room-change/new', ...page(NewRoomChangeRequest) },
        { path: 'requests/room-class/new', ...page(NewRoomClassChange) },
        { path: 'requests/swap/new', ...page(SwapSpecific) },
        { path: 'requests/swap/board', ...page(SwapBoard) },
        { path: 'requests/swap/invitations/:id', ...page(SwapInvitation) },
        { path: 'notifications', ...page(Notifications) },
        { path: 'verification', ...page(Verification) },
        { path: 'registration-periods/:termId', ...page(RegistrationPeriod) },
      ]),

      // Staff work for their Blocks: desk, rooms, maintenance, inspections and meters (ADR-19).
      portal('staff', <BackOfficeLayout role="staff" />, [
        { index: true, ...page(StaffDashboard) },
        { path: 'inventory', ...page(Inventory) },
        { path: 'rooms/:code', ...page(RoomHub) },
        { path: 'door-codes', ...page(DoorCodes) },
        { path: 'furniture', ...page(Furniture) },
        { path: 'meter-readings', ...page(MeterReadings) },
        { path: 'maintenance', ...page(MaintenanceQueue) },
        { path: 'maintenance/:id', ...page(MaintenanceDetail) },
        { path: 'inspections', ...page(InspectionChecklist) },
        { path: 'room-changes', ...page(RoomChangeQueue) },
        { path: 'room-changes/swaps', ...page(SwapRequests) },
        { path: 'next-term', ...page(TermTransition) },
        { path: 'next-term/:tab', ...page(TermTransition) },
        { path: 'moves', ...page(OperationalMoves) },
        { path: 'check-in', ...page(CheckInDesk) },
        { path: 'check-out', ...page(CheckOutDesk) },
        { path: 'students', ...page(Students) },
        { path: 'students/:id', ...page(StudentHub) },
        { path: 'announcements', ...page(Announcements) },
      ]),

      // Managers work for every Block: registration, assignment, payments and decisions (ADR-19). They share
      // the Staff screens for rooms, maintenance and room changes, with a Block filter.
      portal('manager', <BackOfficeLayout role="manager" />, [
        { index: true, ...page(ManagerDashboard) },
        { path: 'approvals', ...page(Approvals, { tab: 'late-check-in' }) },
        { path: 'approvals/late-check-in', ...page(Approvals, { tab: 'late-check-in' }) },
        { path: 'applications', ...page(ApplicationQueue) },
        { path: 'applications/:id', ...page(ApplicationReview) },
        { path: 'assignment', ...page(AssignmentRuns) },
        { path: 'assignment/:runId', ...page(ProposalReview) },
        { path: 'payments', ...page(Payments) },
        { path: 'payment-claims', ...page(PaymentClaims) },
        { path: 'terminations', ...page(Terminations) },
        { path: 'room-changes', ...page(RoomChangeQueue) },
        { path: 'room-changes/swaps', ...page(SwapRequests) },
        { path: 'next-term', ...page(TermTransition) },
        { path: 'next-term/:tab', ...page(TermTransition) },
        { path: 'moves', ...page(OperationalMoves) },
        { path: 'reconciliation', ...page(Reconciliation) },
        { path: 'inventory', ...page(Inventory) },
        { path: 'rooms/:code', ...page(RoomHub) },
        { path: 'room-classes', ...page(RoomClassesByTerm) },
        { path: 'door-codes', ...page(DoorCodes) },
        { path: 'furniture', ...page(Furniture) },
        { path: 'maintenance', ...page(MaintenanceQueue) },
        { path: 'maintenance/:id', ...page(MaintenanceDetail) },
        { path: 'inspections', ...page(InspectionSchedule) },
        { path: 'finance', ...page(BlockFinance) },
        { path: 'staff', ...page(BlockStaff) },
        { path: 'routing-rules', ...page(RoutingRules) },
        { path: 'escalations', ...page(Escalations) },
        { path: 'reports', ...page(BlockReports) },
        { path: 'block-settings', ...page(BlockSettings) },
        { path: 'students', ...page(Students) },
        { path: 'students/:id', ...page(StudentHub) },
        { path: 'student-import', ...page(StudentImport) },
        { path: 'staff-accounts', ...page(StaffAccounts) },
        { path: 'term-requests', ...page(TermRequests) },
        { path: 'terms', ...page(TermDashboard) },
        { path: 'terms/:id', ...page(TermDashboard) },
        { path: 'announcements', ...page(Announcements) },
      ]),

      portal('admin', <BackOfficeLayout role="admin" />, [
        { index: true, ...page(AdminDashboard) },
        { path: 'terms', ...page(Terms) },
        { path: 'terms/new', ...page(NewTerm) },
        { path: 'terms/:id', ...page(TermWizard) },
        { path: 'term-requests', ...page(TermRequests) },
        { path: 'deadlines', ...page(Deadlines) },
        { path: 'refunds', ...page(RefundsTerminations) },
        { path: 'stay', ...page(StayRenewal) },
        { path: 'announcements', ...page(Announcements) },
        { path: 'room-types', ...page(RoomTypes) },
        { path: 'room-classes', ...page(RoomClasses) },
        { path: 'fees', ...page(FeesRules) },
        { path: 'utility', ...page(UtilitySettings) },
        { path: 'eligibility', ...page(EligibilityRules) },
        { path: 'matching', ...page(MatchingCriteria) },
        { path: 'inspection-checklists', ...page(InspectionChecklists) },
        { path: 'notifications', ...page(NotificationTemplates) },
        { path: 'notifications/send', ...page(SendEmail) },
        { path: 'system-parameters', ...page(SystemParameters) },
        { path: 'demo', ...page(DemoData) },
        { path: 'buildings', ...page(Buildings) },
        { path: 'furniture-types', ...page(FurnitureTypes) },
        { path: 'users', ...page(UsersRoles) },
        { path: 'reports/occupancy', ...page(OccupancyReport) },
        { path: 'reports/financial', ...page(FinancialReport) },
        { path: 'audit-log', ...page(AuditLog) },
        { path: 'students', ...page(Students) },
        { path: 'students/:id', ...page(StudentHub) },
        { path: 'student-import', ...page(StudentImport) },
      ]),

      { path: '*', element: <NotFound /> },
    ],
  },
])
