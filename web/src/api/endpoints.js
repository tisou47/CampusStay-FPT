import { download, http } from './client'

/*
 * CampusStay API endpoints used by the web app. Paths are relative to VITE_API_BASE_URL.
 * The expected request and response shapes are listed in docs/api-contract.md (repository root).
 *
 * Conventions
 *  - Lists return { items: [...], total } and accept page, pageSize, q and filters as query parameters.
 *  - Term- and Block-scoped lists take termId and block.
 *  - Money is in VND (integer); dates are ISO 8601 strings.
 */

const g = (path) => (query, opts) => http.get(path, query, opts)

export const api = {
  /* ---------------------------------------------------------------- Session and shared */
  auth: {
    /** Account email and CampusStay password: { email, password, remember }. */
    signIn: (body) => http.post('/auth/sign-in', body),
    /**
     * Google authorization code: { code, remember } from the popup, or { code, redirectUri, remember } after the redirect
     * flow when the popup was blocked (A-22). The server only accepts @fpt.edu.vn accounts.
     */
    google: (body) => http.post('/auth/google', body),
    signOut: () => http.post('/auth/sign-out'),
    me: g('/auth/me'),
    /** { locale: 'vi' | 'en' } → 204: the account's language for notifications, push and emails (ADR-25). */
    setLocale: (body) => http.put('/auth/me/locale', body),
    /** { email } → 204 whether or not the account exists. */
    forgotPassword: (body) => http.post('/auth/password/forgot', body),
    /** { token, newPassword } from a reset or invitation link → 204; every session of the user is signed out. */
    resetPassword: (body) => http.post('/auth/password/reset', body),
    /** { newPassword } → 204: the first password of an account created by Google sign-up (ADR-26). */
    setFirstPassword: (body) => http.post('/auth/password/set', body),
    /** { currentPassword, newPassword } → 204; the user's other sessions are signed out. */
    changePassword: (body) => http.post('/auth/password/change', body),
  },
  terms: {
    list: (opts) => http.get('/terms', undefined, opts),
  },
  /** What students read about a registration period (A-29): the board's card and a published Term's details. */
  registrationPeriods: {
    current: g('/registration-periods/current'),
    details: (termId, opts) => http.get(`/registration-periods/${termId}`, undefined, opts),
  },
  notifications: {
    list: g('/notifications'),
    markAllRead: () => http.post('/notifications/read-all'),
    markRead: (id) => http.post(`/notifications/${id}/read`),
  },
  /* ---------------------------------------------------------------- Student */
  me: {
    home: g('/students/me/home'),
    profile: g('/students/me/profile'),
    applications: g('/students/me/applications'),
    invoices: g('/students/me/invoices'),
    allocation: g('/students/me/allocation'),
    requests: g('/students/me/requests'),
    roommateInvitation: g('/students/me/roommate-invitation'),
    round2Offer: g('/students/me/round2-offer'),
    /** The sign-up form and verification status: { status, locked, note, form, options }. */
    verification: g('/students/me/verification'),
    /** { studentCode, name, gender, dateOfBirth, major, cohort, phone } → 204; Pending verification. */
    sendVerification: (body) => http.put('/students/me/verification', body),
    /** { room, status (Ready, Not ready, Not set), note, changedAt }; the code itself only through revealDoorCode. */
    doorCode: g('/students/me/door-code'),
    /** { room, code, changedAt }; every view is written to the Audit Log. */
    revealDoorCode: () => http.post('/students/me/door-code/reveal'),
    furniture: g('/students/me/furniture'),
    /** { request: { id, status, requestedFor, deadline, reason, decisionReason, createdAt, source } | null, canRequest, checkInEnd, latestDay }. */
    lateCheckIn: g('/students/me/late-check-in'),
    /** multipart: reason, requestedFor (YYYY-MM-DD), evidence (JPEG, PNG or PDF) → { id } (spec §6.9). */
    requestLateCheckIn: (formData) => http.post('/students/me/late-check-in', formData),
    /** The bank account refunds are paid to: { holder, number, bank, updatedAt } (null fields until entered; A-62). */
    refundAccount: g('/students/me/refund-account'),
    saveRefundAccount: (body) => http.put('/students/me/refund-account', body),
    /** The student's refunds (R-24): { items: [{ id, reason, rule, percent, paid, amount, status, createdAt, decidedAt, note }], total, pendingAmount }. */
    refunds: g('/students/me/refunds'),
    /** The dormitory board: announcements shown to the student now, pinned first (A-30). */
    board: g('/students/me/board'),
  },
  catalog: {
    /** Room Types, Room Classes, Term prices, deposit rate, Utility Deposit and form options for a Term. */
    get: g('/catalog'),
  },
  applications: {
    eligibility: g('/applications/eligibility'),
    checkRoommate: (body) => http.post('/applications/roommate-check', body),
    create: (body) => http.post('/applications', body),
    get: (id, opts) => http.get(`/applications/${id}`, undefined, opts),
    cancel: (id, body) => http.post(`/applications/${id}/cancel`, body),
    /** A waitlisted Application: leave the waitlist → { applicationId, refund }; the whole Deposit is refunded (A-61). */
    withdraw: (id) => http.post(`/applications/${id}/withdraw`),
    // Back office
    list: g('/applications'),
    /** Staff decision on one Application: { decision: 'Approved'|'Rejected', note } (note required when rejecting). */
    review: (id, body) => http.post(`/applications/${id}/review`, body),
    /** Staff decision on several Applications: { ids, decision }. */
    bulkReview: (body) => http.post('/applications/bulk-review', body),
  },
  roommateInvitations: {
    respond: (id, body) => http.post(`/roommate-invitations/${id}/respond`, body),
  },
  round2Offers: {
    respond: (id, body) => http.post(`/round2-offers/${id}/respond`, body),
  },
  maintenance: {
    /** Form options (categories, locations, priorities, staff). */
    options: g('/maintenance-requests/options'),
    /** Student or Staff creates a request (multipart: fields + photos[]). */
    create: (formData) => http.post('/maintenance-requests', formData),
    get: (id, opts) => http.get(`/maintenance-requests/${id}`, undefined, opts),
    /** Student confirms the fix or reopens: { fixed, comment }. */
    confirm: (id, body) => http.post(`/maintenance-requests/${id}/confirm`, body),
    // Back office
    list: g('/maintenance-requests'),
    update: (id, body) => http.patch(`/maintenance-requests/${id}`, body),
    addUpdate: (id, body) => http.post(`/maintenance-requests/${id}/updates`, body),
  },
  /* ---------------------------------------------------------------- Term transition (Change Spec v2 phase 6) */
  /** Room Class change of a Room for the next Term, with the consent of its continuing residents (spec §6.11). */
  roomClassChanges: {
    /** Student: their next-Term Room, its class and the classes with their next-Term price, the open change. */
    options: g('/room-class-changes/options'),
    /** Student { roomClassId, reason } or Manager { termId, room, roomClassId, reason } → { id, status }. */
    create: (body) => http.post('/room-class-changes', body),
    /** Student { agree } → 204. */
    consent: (id, body) => http.post(`/room-class-changes/${id}/consent`, body),
    list: g('/room-class-changes'),
    get: (id, opts) => http.get(`/room-class-changes/${id}`, undefined, opts),
    /** { decision: Approved | Rejected, note } → the detail. */
    decide: (id, body) => http.post(`/room-class-changes/${id}/decision`, body),
    /** Manager { note } → the detail: the class goes back; fees of the Room are adjusted. */
    setBack: (id, body) => http.post(`/room-class-changes/${id}/set-back`, body),
  },
  /** Extension and end of stay (spec §6.10). */
  stay: {
    /** { terms, reason } → { id, status, automatic, note }. */
    extend: (body) => http.post('/students/me/stay/extension', body),
    /** { reason } → { id, status, automatic, note }: the Bed kept for the next Term is released. */
    end: (body) => http.post('/students/me/stay/end', body),
    requests: g('/stay-requests'),
    decide: (id, body) => http.post(`/stay-requests/${id}/decision`, body),
  },
  /** Every open next-Term request of a window, decided in bulk: { items: [{ kind, id }], decision, reason }. */
  nextTermRequests: {
    list: g('/next-term-requests'),
    decide: (body) => http.post('/next-term-requests/decision', body),
  },
  renewals: {
    /** Terms with a requests window. */
    list: g('/renewals'),
    /** Milestones, counts, open requests, reconciliation, Beds of new students. */
    overview: g('/renewals/overview'),
    /** Manager: preview with blockers, then issue the next-Term fees: { termId }. */
    fees: g('/next-term-fees'),
    issueFees: (body) => http.post('/next-term-fees/issue', body),
    /** Leavers, movers and Rooms whose residents change between two Terms. */
    turnover: g('/turnover'),
    /** { room, electricity, water } → 204. */
    meterCut: (body) => http.post('/turnover/meter-cuts', body),
  },
  /** Operational moves during a Term (spec §6.13): nothing is charged. */
  operationalMoves: {
    /** { allocationId } or { q: student code } → the student, free Beds, reasons. */
    options: g('/operational-moves/options'),
    move: (body) => http.post('/operational-moves', body),
    list: g('/operational-moves'),
  },
  /** Enrollment reconciliation of a Term (spec §6.12). */
  reconciliations: {
    overview: g('/reconciliations'),
    template: (kind) => download('/reconciliations/template', { query: { kind }, fallbackName: `${kind}-template.xlsx` }),
    /** Multipart: termId, kind (enrolled | leavers), file → the run with its items. */
    upload: (formData) => http.post('/reconciliations', formData),
    get: (id, opts) => http.get(`/reconciliations/${id}`, undefined, opts),
    /** { outcome: Not enrolled | Enrolled, note } → the item. */
    resolve: (id, itemId, body) => http.post(`/reconciliations/${id}/items/${itemId}/resolve`, body),
  },
  roomChanges: {
    /** Student form options: the next-Term Bed, Room Types/Classes, the next Term's prices, the window, reasons. */
    options: g('/room-changes/options'),
    create: (body) => http.post('/room-changes', body),
    // Back office
    list: g('/room-changes'),
    matchingBeds: (id, opts) => http.get(`/room-changes/${id}/matching-beds`, undefined, opts),
    decide: (id, body) => http.post(`/room-changes/${id}/decision`, body),
  },
  swaps: {
    /** Student: invite a specific Student to swap. Body { studentCode, reason }. */
    create: (body) => http.post('/swaps', body),
    board: g('/swap-board'),
    savePost: (body) => http.put('/swap-board/my-post', body),
    requestPost: (postId) => http.post(`/swap-board/posts/${postId}/request`),
    invitation: (id, opts) => http.get(`/swap-invitations/${id}`, undefined, opts),
    respond: (id, body) => http.post(`/swap-invitations/${id}/respond`, body),
    // Back office
    list: g('/swaps'),
    decide: (id, body) => http.post(`/swaps/${id}/decision`, body),
  },
  invoices: {
    get: (id, opts) => http.get(`/invoices/${id}`, undefined, opts),
    /** VietQR image (when a bank account is configured), the claim state and canClaim (ADR-22). */
    payment: (id, opts) => http.get(`/invoices/${id}/payment`, undefined, opts),
    refreshQr: (id) => http.post(`/invoices/${id}/payment/refresh`),
    receipt: (id) => download(`/invoices/${id}/receipt`, { fallbackName: `receipt-${id}.pdf` }),
    /** "I have transferred" { reference? } → { status, claimedAt, reference, rejected, lastRejection }. */
    claim: (id, body) => http.post(`/invoices/${id}/claim`, body),
  },

  /* ---------------------------------------------------------------- Back office */
  assignment: {
    runs: g('/assignment-runs'),
    start: (body) => http.post('/assignment-runs', body),
    /** Proposal of a run, one Block (or the waitlist) at a time. */
    proposal: (runId, query, opts) => http.get(`/assignment-runs/${runId}/proposal`, query, opts),
    conflict: (runId, applicationId, opts) => http.get(`/assignment-runs/${runId}/conflicts/${applicationId}`, undefined, opts),
    resolveConflict: (runId, applicationId, body) => http.post(`/assignment-runs/${runId}/conflicts/${applicationId}/resolve`, body),
    /** A Manager commits a Block: { block }. Allocations, Balance Invoices and notifications follow at once (ADR-19, C-38). */
    commit: (runId, body) => http.post(`/assignment-runs/${runId}/commit`, body),
    /** Round 2 of a Term (FR-APP-07): { termId, waitlisted, openOffers, freeBeds }. */
    round2: (termId, opts) => http.get('/round2', { termId }, opts),
    /** A Manager offers the free Beds to the waitlisted students: { termId } → { offered, waitlisted, freeBeds }. */
    runRound2: (body) => http.post('/round2/run', body),
    /**
     * Who Round 2 reached (A-58): { termId, status (Pending, Accepted, Declined, Expired, Withdrawn, No offer), q, page,
     * pageSize } → { items: [{ id, applicationId, studentName, studentCode, requested, status, offeredAt, expiresAt,
     * respondedAt, options: [{ block, roomTypeName, roomClassName, termPrice, difference, chosen }] }], total, counts }.
     */
    round2Offers: g('/round2/offers'),
  },
  inventory: {
    structure: g('/inventory/structure'),
    /** Rooms and Beds on one floor. */
    floor: g('/inventory/rooms'),
    room: (code, opts) => http.get(`/inventory/rooms/${code}`, undefined, opts),
    setOutOfService: (code, body) => http.post(`/inventory/rooms/${code}/out-of-service`, body),
    backInService: (code) => http.post(`/inventory/rooms/${code}/back-in-service`),
    /** multipart file (CSV or XLSX, a column of Room codes) → { rooms: [{ code, block, floor }], unknown: [code] }. */
    roomCodes: (formData) => http.post('/inventory/room-codes', formData),
    /** The Room panel: its Room Class in the Term and the next one, furniture conformance, items, door code state. */
    details: (code, query, opts) => http.get(`/inventory/rooms/${code}/details`, query, opts),
    /** The Room hub: { details, sections: { residents, meterReadings, maintenance, inspections } } (spec §11.3). */
    hub: (code, query, opts) => http.get(`/inventory/rooms/${code}/hub`, query, opts),
    /** Room Classes per Term (ADR-24): { termId, block, floor, roomClassId, match, q, page, pageSize }. */
    roomClasses: g('/inventory/room-classes'),
    /** { termId, rooms: [code], roomClassId } → { changed, unchanged }; Managers, Terms not started only. */
    setRoomClass: (body) => http.put('/inventory/room-classes', body),
  },
  furniture: {
    list: g('/furniture'),
    get: (id, opts) => http.get(`/furniture/${id}`, undefined, opts),
    /** Managers: { typeId, block, room?, quantity, note? } → { assetCodes }. */
    register: (body) => http.post('/furniture', body),
    /** { status?, note?, reason? } → the item. */
    update: (id, body) => http.put(`/furniture/${id}`, body),
    moves: g('/furniture/moves'),
    /** { items: [id], toRoom? | toStore? (Block code), reason, planned } → { moved, planned }. */
    move: (body) => http.post('/furniture/moves', body),
    finishMove: (id) => http.post(`/furniture/moves/${id}/done`),
    cancelMove: (id) => http.post(`/furniture/moves/${id}/cancel`),
  },
  doorCodes: {
    list: g('/door-codes'),
    /** { code? } (6 digits; blank = random) → { room, code }. */
    propose: (room, body) => http.post(`/door-codes/${room}`, body),
    confirm: (room) => http.post(`/door-codes/${room}/confirm`),
    cancel: (room) => http.post(`/door-codes/${room}/cancel`),
    /** { room, active, proposed }; every view is written to the Audit Log. */
    reveal: (room) => http.post(`/door-codes/${room}/reveal`),
    /** multipart file (CSV room,code) → { proposed }. */
    import: (formData) => http.post('/door-codes/import', formData),
  },
  desk: {
    /** Today's check-in numbers and recent check-ins. */
    checkInToday: g('/check-in/today'),
    /** Find a student by code, name or QR pass payload. */
    checkInLookup: g('/check-in/lookup'),
    checkIn: (body) => http.post('/check-in', body),
    /** Multipart studentCode, reason, requestedFor (YYYY-MM-DD), termId?, evidence? → { id }; the Block Manager decides it. */
    recordLateCheckIn: (formData) => http.post('/late-check-ins', formData),
    checkOutList: g('/check-out'),
    /** By Allocation id: the student code is personal data and never goes into a URL. */
    checkOutDetail: (allocationId, opts) => http.get(`/check-out/${allocationId}`, undefined, opts),
    checkOut: (allocationId, body) => http.post(`/check-out/${allocationId}`, body),
    /** Final meter readings Room by Room (spec §6.16): { items: [{ room, students, electricity, water }] }. */
    roomReadings: g('/check-out/readings'),
    /** { readings: [{ room, electricity, water }] } → { rooms, students, problems: [{ line, room, message }] }. */
    saveRoomReadings: (scope, body) => http.put(`/check-out/readings?${new URLSearchParams(Object.entries(scope).filter(([, v]) => v != null && v !== ''))}`, body),
    roomReadingsTemplate: (scope) => download('/check-out/readings/template', { query: scope, fallbackName: 'check-out-readings.xlsx' }),
    /** multipart file (the template filled in, CSV or XLSX) → like saveRoomReadings. */
    uploadRoomReadings: (scope, formData) => http.post(`/check-out/readings?${new URLSearchParams(Object.entries(scope).filter(([, v]) => v != null && v !== ''))}`, formData),
  },
  meters: {
    periods: g('/meter-periods'),
    list: (periodId, query, opts) => http.get(`/meter-periods/${periodId}/readings`, query, opts),
    /** One Room with its split preview. */
    room: (periodId, room, opts) => http.get(`/meter-periods/${periodId}/readings/${room}`, undefined, opts),
    save: (periodId, room, body) => http.put(`/meter-periods/${periodId}/readings/${room}`, body),
    confirm: (periodId, room) => http.post(`/meter-periods/${periodId}/readings/${room}/confirm`),
    /** The period's Rooms with their previous values, to fill in Excel (A-59). */
    template: (periodId, label) => download(`/meter-periods/${periodId}/template`, { fallbackName: `meter-readings-${label ?? periodId}.xlsx` }),
    /** multipart file: the template filled in (XLSX or CSV) → { imported, skipped }; blank lines are Rooms read later. */
    import: (periodId, formData) => http.post(`/meter-periods/${periodId}/import`, formData),
    close: (periodId) => http.post(`/meter-periods/${periodId}/close`),
  },
  inspections: {
    // Staff runs
    current: g('/inspection-runs/current'),
    upcoming: g('/inspection-runs/upcoming'),
    rooms: (runId, query, opts) => http.get(`/inspection-runs/${runId}/rooms`, query, opts),
    saveRoom: (runId, room, body) => http.put(`/inspection-runs/${runId}/rooms/${room}`, body),
    unreachable: (runId, room) => http.post(`/inspection-runs/${runId}/rooms/${room}/unreachable`),
    submit: (runId) => http.post(`/inspection-runs/${runId}/submit`),
    // Manager schedules
    schedules: g('/inspection-schedules'),
    createSchedule: (body) => http.post('/inspection-schedules', body),
    updateSchedule: (id, body) => http.put(`/inspection-schedules/${id}`, body),
    // Admin checklists
    checklists: g('/inspection-checklists'),
    createChecklist: (body) => http.post('/inspection-checklists', body),
    publishChecklist: (id, body) => http.post(`/inspection-checklists/${id}/publish`, body),
    archiveChecklist: (id) => http.post(`/inspection-checklists/${id}/archive`),
  },
  approvals: {
    summary: g('/approvals/summary'),
    /** The Block proposal waiting for the Manager. */
    lateCheckIns: g('/late-check-ins'),
    decideLateCheckIn: (id, body) => http.post(`/late-check-ins/${id}/decision`, body),
  },
  finance: {
    summary: g('/finance/summary'),
    refunds: g('/refunds'),
    decideRefund: (id, body) => http.post(`/refunds/${id}/decision`, body),
    /** R-19: in-app and push reminder to enter the refund bank account → { remindedAt }. */
    remindAccount: (id) => http.post(`/refunds/${id}/account-reminder`),
    overdue: g('/finance/overdue'),
    remind: (body) => http.post('/finance/reminders', body),
    invoices: g('/invoices'),
    /** Admin Financial Report. */
    report: g('/reports/financial'),
  },
  students: {
    /** Manager › Students (Staff: residents of their Blocks): q, verification, enrollment, gender, cohort, resident, block. */
    list: g('/student-accounts'),
    /** The student hub: profile, account, verification, residence, sections, history, actions. */
    hub: (id, opts) => http.get(`/student-accounts/${id}`, undefined, opts),
    edit: (id, body) => http.put(`/student-accounts/${id}`, body),
    verify: (id) => http.post(`/student-accounts/${id}/verify`),
    /** { reason } → 204: the account is locked and the reason shown at sign-in. */
    reject: (id, body) => http.post(`/student-accounts/${id}/reject`, body),
    lock: (id, body) => http.post(`/student-accounts/${id}/lock`, body),
    unlock: (id) => http.post(`/student-accounts/${id}/unlock`),
  },
  studentImports: {
    history: g('/student-imports'),
    template: () => download('/student-imports/template', { fallbackName: 'student-list-template.xlsx' }),
    /** Multipart file (CSV or XLSX) → the preview. */
    upload: (formData) => http.post('/student-imports', formData),
    get: (id, query, opts) => http.get(`/student-imports/${id}`, query, opts),
    /** { markMissingNotEnrolled } → the applied import with its result. */
    confirm: (id, body) => http.post(`/student-imports/${id}/confirm`, body),
  },
  staffAccounts: {
    list: g('/staff-accounts'),
    /** { name, email, title?, blocks: [codes] } → { id }; the invitation email is sent. */
    create: (body) => http.post('/staff-accounts', body),
    /** { name?, title?, blocks?, status? } → the updated item. */
    update: (id, body) => http.put(`/staff-accounts/${id}`, body),
    resendInvitation: (id) => http.post(`/staff-accounts/${id}/invitation`),
  },
  blockStaff: {
    /** The signed-in Staff member's or Manager's own { id, onDuty, handles, blocks, open, resolved7d } (A-60). */
    me: g('/block-staff/me'),
    /** { onDuty } → the same: starts or ends the signed-in person's shift. */
    setDuty: (body) => http.put('/block-staff/me/duty', body),
    list: g('/block-staff'),
    update: (id, body) => http.put(`/block-staff/${id}`, body),
    requestAccount: (body) => http.post('/staff-account-requests', body),
  },
  routing: {
    get: g('/routing-rules'),
    save: (id, body) => http.put(`/routing-rules/${id}`, body),
    create: (body) => http.post('/routing-rules', body),
    saveTimers: (body) => http.put('/routing-rules/timers', body),
  },
  escalations: {
    list: g('/escalations'),
    act: (id, body) => http.post(`/escalations/${id}/actions`, body),
  },
  blockSettings: {
    get: g('/block-settings'),
    save: (body) => http.put('/block-settings', body),
  },
  reports: {
    /** Manager Block Reports (weekly check-ins). */
    block: g('/reports/block'),
    /** Admin Occupancy Report. */
    occupancy: g('/reports/occupancy'),
  },
  /** Payment claims (ADR-22): the Managers' queue; each Invoice is confirmed or rejected on its own. */
  paymentClaims: {
    list: g('/payment-claims'),
    /** The transfer receipt of an open claim (multipart: receipt) → { name, size, url } (R-23). */
    attachReceipt: (invoiceId, formData) => http.post(`/payment-claims/${invoiceId}/receipt`, formData),
    /** { invoiceIds } → { confirmed, amount, skipped: [{ invoiceId, reason }] }; claims without a receipt are skipped. */
    confirm: (body) => http.post('/payment-claims/confirm', body),
    /** { invoiceIds, reason } → { rejected, cancelled, skipped }. */
    reject: (body) => http.post('/payment-claims/reject', body),
  },
  /** Terminations of stays (spec §6.15): Managers start and cancel them, Staff read their Blocks'. */
  terminations: {
    list: g('/terminations'),
    /** { studentCode, reason: 'Manager decision' | 'Not enrolled', note } → { id, moveOutBy }. */
    start: (body) => http.post('/terminations', body),
    cancel: (id, body) => http.post(`/terminations/${id}/cancel`, body),
  },
  payments: {
    list: g('/payments'),
    /** A Manager confirms one Invoice (multipart: reference?, receipt?): its claim, or a transfer not claimed yet. */
    confirm: (invoiceId, formData) => http.post(`/payments/${invoiceId}/confirm`, formData),
  },
  /** Vietnamese banks a refund can go to (R-22): [{ bin, shortName, name }]. */
  banks: g('/banks'),
  /** Back-office search in the top bar: { q } → { q, items: [{ kind, id, title, detail }] } (spec §11.3). */
  search: (q, opts) => http.get('/search', { q }, opts),
  dashboards: {
    staff: g('/dashboards/staff'),
    manager: g('/dashboards/manager'),
    admin: g('/dashboards/admin'),
    /** A published Term: milestones, Applications by status, places, Deposits and Balances (A-32). */
    term: g('/dashboards/term'),
  },
  /** Registration-period requests (A-28): Managers send them; Managers and the Admin read and comment; the Admin answers. */
  termRequests: {
    list: g('/term-requests'),
    get: (id, opts) => http.get(`/term-requests/${id}`, undefined, opts),
    create: (body) => http.post('/term-requests', body),
    update: (id, body) => http.put(`/term-requests/${id}`, body),
    comment: (id, body) => http.post(`/term-requests/${id}/comments`, body),
    /** { status: In progress | Needs changes | Rejected, note } */
    decide: (id, body) => http.post(`/term-requests/${id}/decision`, body),
  },
  /** Announcements to students (A-30): Staff for the residents of their Blocks, Managers and the Admin for anyone. */
  announcements: {
    list: g('/announcements'),
    options: g('/announcements/options'),
    create: (body) => http.post('/announcements', body),
    /** { pinned?, shownUntil?, end? } */
    change: (id, body) => http.put(`/announcements/${id}`, body),
  },

  /* ---------------------------------------------------------------- Admin configuration */
  admin: {
    terms: {
      list: g('/admin/terms'),
      create: (body) => http.post('/admin/terms', body),
      update: (id, body) => http.put(`/admin/terms/${id}`, body),
      publish: (id, body) => http.post(`/admin/terms/${id}/publish`, body),
      /** The wizard (A-27): { name, stayStart, stayEnd, requestId? } → { id } (a Draft, or the request's Draft). */
      createDraft: (body) => http.post('/admin/terms/drafts', body),
      wizard: (id, opts) => http.get(`/admin/terms/${id}/wizard`, undefined, opts),
      /** step: general | timeline | rooms | prices | rules | information. */
      saveStep: (id, step, body) => http.put(`/admin/terms/${id}/wizard/${step}`, body),
    },
    roomTypes: {
      list: g('/admin/room-types'),
      create: (body) => http.post('/admin/room-types', body),
      update: (id, body) => http.put(`/admin/room-types/${id}`, body),
    },
    roomClasses: {
      list: g('/admin/room-classes'),
      create: (body) => http.post('/admin/room-classes', body),
      update: (id, body) => http.put(`/admin/room-classes/${id}`, body),
    },
    /** Deposit, refund rules and penalties. */
    fees: { get: g('/admin/fees'), save: (body) => http.put('/admin/fees', body) },
    /** Utility billing and Utility Deposit. */
    utility: { get: g('/admin/utility'), save: (body) => http.put('/admin/utility', body) },
    eligibility: { get: g('/admin/eligibility'), save: (body) => http.put('/admin/eligibility', body) },
    matching: {
      get: g('/admin/matching'),
      save: (body) => http.put('/admin/matching', body),
      /** Dry run with unsaved settings; nothing is allocated. */
      preview: (body) => http.post('/admin/matching/preview', body),
    },
    system: { get: g('/admin/system-parameters'), save: (body) => http.put('/admin/system-parameters', body) },
    /** Demo servers only (DEMO_TOOLS=true): reset to a stage, sample files made from the stage loaded now. */
    demo: {
      status: g('/admin/demo'),
      reset: (body) => http.post('/admin/demo/reset', body),
      file: (kind, name) => download(`/admin/demo/files/${kind}`, { fallbackName: name }),
    },
    /** Settings grouped by subject (A-31): deadlines, refunds, stay. PUT { values: { key: value } }. */
    settings: (group) => ({
      get: (query, opts) => http.get(`/admin/settings/${group}`, query, opts),
      save: (body) => http.put(`/admin/settings/${group}`, body),
    }),
    templates: {
      list: g('/admin/notification-templates'),
      save: (key, body) => http.put(`/admin/notification-templates/${key}`, body),
      test: (key, body) => http.post(`/admin/notification-templates/${key}/test`, body),
    },
    emails: {
      options: g('/admin/emails/options'),
      /** Recipient count and a preview for the first recipient. */
      preview: (body) => http.post('/admin/emails/preview', body),
      send: (body) => http.post('/admin/emails', body),
    },
    buildings: {
      list: g('/admin/buildings'),
      createBlock: (body) => http.post('/admin/buildings', body),
      updateBlock: (id, body) => http.put(`/admin/buildings/${id}`, body),
      bulkRooms: (id, body) => http.post(`/admin/buildings/${id}/rooms/bulk`, body),
      floorRooms: (id, floor, opts) => http.get(`/admin/buildings/${id}/floors/${floor}/rooms`, undefined, opts),
    },
    furnitureTypes: {
      list: g('/admin/furniture-types'),
      create: (body) => http.post('/admin/furniture-types', body),
      update: (id, body) => http.put(`/admin/furniture-types/${id}`, body),
    },
    /** What furniture each Room Class requires: PUT { items: [{ typeId, quantity }] } replaces a class's list. */
    requirements: {
      list: g('/admin/room-class-requirements'),
      save: (roomClassId, body) => http.put(`/admin/room-class-requirements/${roomClassId}`, body),
    },
    users: {
      list: g('/admin/users'),
      invite: (body) => http.post('/admin/users', body),
      update: (id, body) => http.put(`/admin/users/${id}`, body),
      permissions: g('/admin/permissions'),
    },
    auditLog: g('/admin/audit-log'),
  },

  exports: {
    /** Server-side exports (CSV/XLSX). `report` names the export, e.g. "maintenance", "occupancy". */
    download: (report, query, fallbackName) => download(`/exports/${report}`, { query, fallbackName }),
  },
}
