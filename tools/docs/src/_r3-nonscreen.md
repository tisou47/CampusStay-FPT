**Scheduled jobs** (14)

| Class | Method | Schedule | What it does |
|---|---|---|---|
| ApplicationExpiryJob | run | every 5m (setting campusstay.app.expiry-interval) |  |
| DutyPresence | sweep | every 5m (setting campusstay.auth.duty-interval) | A Staff member's or Manager's duty follows their presence: signing in (or using the app again) puts them on duty; signing out, or no live session used within workload.duty_idle_minutes, takes them off. |
| EmailOutboxDispatcher | dispatch | every 30s (setting campusstay.mail.dispatch-interval) |  |
| EscalationJob | run | every 15m (setting campusstay.req.sla-interval) |  |
| InspectionJob | run | cron ${campusstay.mnt.inspection-cron:0 0 6 * * *} |  |
| MeterReminderJob | run | every 1h (setting campusstay.bil.meter-interval) |  |
| OverdueJob | run | every 1h (setting campusstay.bil.overdue-interval) |  |
| PaymentReminderJob | run | every 1h (setting campusstay.bil.reminder-interval) |  |
| RenewalJobs | run | every 15m (setting campusstay.asg.renewal-interval) |  |
| ResidenceJobs | forfeit | every 5m (setting campusstay.asg.forfeit-interval) |  |
| ResidenceJobs | release | every 15m (setting campusstay.asg.release-interval) |  |
| SessionService | purgeOldSessions | cron 0 15 3 * * * | Opaque bearer sessions (ADR-07). |
| SwapExpiryJob | run | every 5m (setting campusstay.req.expiry-interval) |  |
| WeekScheduleService | remindJob | cron 0 5 * * * * | The weekly handover of the Staff schedule: shifts repeat every week, and a Manager sends next week's schedule to the Staff of their Blocks (each Staff member is told their shifts). |

**Event listeners** (89): a domain event published by one feature and handled by another, in the same transaction or after commit.

| Event | Handled by | When | What it does |
|---|---|---|---|
| AllocationCreated | StudentNotificationListener.on | same transaction |  |
| AllocationForfeited | ApplicationService.on | same transaction | The Application lifecycle up to submission (S2): create with a Deposit Invoice, roommate invitation and its answer, Deposit payment, cancellation and expiry. |
| AllocationForfeited | FinanceNotificationListener.on | same transaction |  |
| AllocationMoved | NextTermRequestsService.on | same transaction | Every next-Term request of a requests window still waiting for a decision, in one list (spec §5.1 M4: Managers decide in bulk), and the bulk decision itself. |
| ApplicationCreated | StudentNotificationListener.on | same transaction |  |
| ApplicationRejected | StudentNotificationListener.on | same transaction |  |
| ApplicationSubmitted | StudentNotificationListener.on | same transaction |  |
| ApplicationWaitlisted | StudentNotificationListener.on | same transaction |  |
| CheckInAvailable | HandoverNotificationListener.on | same transaction |  |
| CheckInInventoryDue | HandoverNotificationListener.on | same transaction |  |
| CheckInInventoryFinal | HandoverNotificationListener.on | same transaction |  |
| CheckInInventorySubmitted | HandoverNotificationListener.on | same transaction |  |
| CheckInToAgree | HandoverNotificationListener.on | same transaction |  |
| CheckInVisit | HandoverNotificationListener.on | same transaction |  |
| CheckOutCompleted | HandoverNotificationListener.on | same transaction |  |
| CheckOutToAgree | HandoverNotificationListener.on | same transaction |  |
| DamageToAcknowledge | HandoverNotificationListener.on | same transaction |  |
| DoorCodeActivated | DoorCodeRelease.on | same transaction | Releases a Room's door code to its paid residents (ADR-23, spec §6.8): (a) the Balance or the next-Term fee is paid, (b) the Term's check-in start has come, (c) the Room's code is confirmed on the lock and no change is waiting because someone left. |
| DoorCodeChanged | DoorCodeNotificationListener.on | same transaction |  |
| DoorCodeReleased | DoorCodeNotificationListener.on | same transaction |  |
| DoorCodeToSet | DoorCodeNotificationListener.on | same transaction |  |
| EndOfStayNotice | RenewalNotificationListener.on | same transaction |  |
| EscalationAssigned | StaffNotificationListener.on | same transaction |  |
| FamilyDayCancelled | FamilyDayNotificationListener.on | same transaction |  |
| FamilyDayGuestsOverdue | FamilyDayNotificationListener.on | same transaction |  |
| FamilyDayPublished | FamilyDayNotificationListener.on | same transaction |  |
| FamilyDayRegistered | FamilyDayNotificationListener.on | same transaction |  |
| FamilyDayRegistrationCancelled | FamilyDayNotificationListener.on | same transaction |  |
| FurnitureDamaged | FurnitureService.on | same transaction | Furniture items (ADR-24, spec D-21, §6.19): every piece with its asset code, status and location (a Room or the store of a Block), and its history. |
| FurnitureFoundDamaged | FurnitureFoundListener.on | same transaction |  |
| FurnitureRepairLogged | FurnitureService.on | same transaction | Furniture items (ADR-24, spec D-21, §6.19): every piece with its asset code, status and location (a Room or the store of a Block), and its history. |
| InspectionAssigned | StaffNotificationListener.on | same transaction |  |
| InspectionScheduled | StudentNotificationListener.on | same transaction |  |
| InvoiceIssued | StudentNotificationListener.on | same transaction |  |
| InvoiceOverdue | FinanceNotificationListener.on | same transaction |  |
| LateCheckInDecided | FinanceNotificationListener.on | same transaction |  |
| LateCheckInRequested | ResidenceNotificationListener.on | same transaction |  |
| MaintenanceReported | MaintenanceRouting.on | same transaction |  |
| MaintenanceUpdated | StudentNotificationListener.on | same transaction |  |
| MeterPeriodLate | StaffNotificationListener.on | same transaction |  |
| NextTermAllocationCancelled | NextTermRequestsService.on | same transaction | Every next-Term request of a requests window still waiting for a decision, in one list (spec §5.1 M4: Managers decide in bulk), and the bulk decision itself. |
| NextTermAllocationCancelled | RenewalNotificationListener.on | same transaction | The Term transition (spec §10): the requests window (where a continuing resident stays, the last Term of a Stay), consents asked, next-Term requests decided, a next-Term Bed released, the end-of-stay notice, an operational move and the Managers' alert before the decision deadline. |
| NextTermBedTaken | ResidenceNotificationListener.on | same transaction |  |
| NextTermRequestDecided | RenewalNotificationListener.on | same transaction |  |
| PasswordResetRequested | AuthEmailListener.on | same transaction |  |
| PaymentClaimRejected | ApplicationService.on | same transaction | The Application lifecycle up to submission (S2): create with a Deposit Invoice, roommate invitation and its answer, Deposit payment, cancellation and expiry. |
| PaymentClaimRejected | FinanceNotificationListener.on | same transaction |  |
| PaymentClaimRejected | ForfeitService.on | same transaction | The forfeit (spec §6.6, §8): an Allocation whose Balance is still unpaid at its deadline, with no claim waiting for confirmation and no approved late check-in still running, is cancelled; the Balance is void and the Deposit is kept (refund rule "Balance not paid", default 0 %). |
| PaymentClaimRejected | RenewalService.on | same transaction | The requests window of a Term (spec §5.1, §6.10). |
| PaymentClaimsWaiting | FinanceNotificationListener.on | same transaction |  |
| PaymentConfirmed | ApplicationService.on | same transaction | The Application lifecycle up to submission (S2): create with a Deposit Invoice, roommate invitation and its answer, Deposit payment, cancellation and expiry. |
| PaymentConfirmed | DoorCodeRelease.on | same transaction | Releases a Room's door code to its paid residents (ADR-23, spec §6.8): (a) the Balance or the next-Term fee is paid, (b) the Term's check-in start has come, (c) the Room's code is confirmed on the lock and no change is waiting because someone left. |
| PaymentConfirmed | RenewalService.on | same transaction | The requests window of a Term (spec §5.1, §6.10). |
| PaymentConfirmed | StudentNotificationListener.on | same transaction |  |
| PaymentConfirmed | UtilityDebtService.on | same transaction | Utility debt (spec §6.14, D-27), worked out from the student's Invoices each time, so running it twice changes nothing. |
| PaymentDueSoon | FinanceNotificationListener.on | same transaction |  |
| PolicyChanged | RegistrationPeriodListener.on | same transaction |  |
| RefundAccountReminded | FinanceNotificationListener.on | same transaction |  |
| RefundDecided | FinanceNotificationListener.on | same transaction |  |
| RenewalWorkUndecided | RenewalNotificationListener.on | same transaction |  |
| RequestsWindowOpened | RenewalNotificationListener.on | same transaction |  |
| ResidentLeftRoom | DoorCodeRotation.on | same transaction |  |
| ResidentMoved | RenewalNotificationListener.on | same transaction |  |
| RoomChangeDecided | StudentNotificationListener.on | same transaction |  |
| RoommateInvited | StudentNotificationListener.on | same transaction |  |
| RoomTypeBedsChanged | RoomTypeBedsListener.on | same transaction |  |
| Round2Offered | StudentNotificationListener.on | same transaction |  |
| StudentNotEnrolled | ApplicationReviewService.on | same transaction | Staff and Manager › Applications: the review queue, the back-office view and the decision. |
| StudentNotEnrolled | RenewalService.on | same transaction | The requests window of a Term (spec §5.1, §6.10). |
| StudentVerificationRequested | AccountNotificationListener.on | same transaction |  |
| StudentVerified | AccountNotificationListener.on | same transaction |  |
| SwapDecided | StudentNotificationListener.on | same transaction |  |
| SwapInvited | StudentNotificationListener.on | same transaction |  |
| TemporaryBedArranged | StaffNotificationListener.on | same transaction |  |
| TerminationCancelled | ResidenceNotificationListener.on | same transaction |  |
| TerminationCancelled | UtilityDebtService.on | same transaction | Utility debt (spec §6.14, D-27), worked out from the student's Invoices each time, so running it twice changes nothing. |
| TerminationOverdue | ResidenceNotificationListener.on | same transaction |  |
| TerminationStarted | ResidenceNotificationListener.on | same transaction |  |
| TerminationStarted | UtilityDebtService.on | same transaction | Utility debt (spec §6.14, D-27), worked out from the student's Invoices each time, so running it twice changes nothing. |
| TermPublished | RegistrationPeriodListener.on | same transaction |  |
| TermRequestCommented | RegistrationPeriodListener.on | same transaction |  |
| TermRequestDecided | RegistrationPeriodListener.on | same transaction |  |
| TermRequestSubmitted | RegistrationPeriodListener.on | same transaction |  |
| UtilityTerminationDue | TerminationService.on | same transaction | Terminations of a stay (spec §6.15, D-27): Utility debt (automatic, from Billing's rule), not enrolled, or a Manager's decision with a reason. |
| UtilityWarningIssued | FinanceNotificationListener.on | same transaction |  |
| WaitlistEnded | StudentNotificationListener.on | same transaction |  |
| WeekScheduleReminderDue | StaffNotificationListener.on | same transaction |  |
| WeekScheduleSent | StaffNotificationListener.on | same transaction |  |
| WorkReassigned | StaffNotificationListener.on | same transaction |  |
