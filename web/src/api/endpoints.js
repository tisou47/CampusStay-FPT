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
    /** Google authorization code from the popup: { code, remember }. The server only accepts @fpt.edu.vn accounts. */
    google: (body) => http.post('/auth/google', body),
    signOut: () => http.post('/auth/sign-out'),
    me: g('/auth/me'),
    /** { email } → 204 whether or not the account exists. */
    forgotPassword: (body) => http.post('/auth/password/forgot', body),
    /** { token, newPassword } from a reset or invitation link → 204; every session of the user is signed out. */
    resetPassword: (body) => http.post('/auth/password/reset', body),
    /** { currentPassword, newPassword } → 204; the user's other sessions are signed out. */
    changePassword: (body) => http.post('/auth/password/change', body),
  },
  terms: {
    list: (opts) => http.get('/terms', undefined, opts),
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
  roomChanges: {
    /** Student form options: current Room, Room Types/Classes, prices, remaining days, reasons. */
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
    /** VietQR payment details and live status for an unpaid Invoice. */
    payment: (id, opts) => http.get(`/invoices/${id}/payment`, undefined, opts),
    refreshQr: (id) => http.post(`/invoices/${id}/payment/refresh`),
    receipt: (id) => download(`/invoices/${id}/receipt`, { fallbackName: `receipt-${id}.pdf` }),
    /** Dev profile only: pays the Invoice as if SePay had reported the exact transfer → 204. */
    simulatePayment: (id) => http.post(`/dev/invoices/${id}/simulate-payment`),
  },

  /* ---------------------------------------------------------------- Back office */
  assignment: {
    runs: g('/assignment-runs'),
    start: (body) => http.post('/assignment-runs', body),
    /** Proposal of a run, one Block (or the waitlist) at a time. */
    proposal: (runId, query, opts) => http.get(`/assignment-runs/${runId}/proposal`, query, opts),
    conflict: (runId, applicationId, opts) => http.get(`/assignment-runs/${runId}/conflicts/${applicationId}`, undefined, opts),
    resolveConflict: (runId, applicationId, body) => http.post(`/assignment-runs/${runId}/conflicts/${applicationId}/resolve`, body),
    /** Staff commits a Block and sends it to the Manager: { block }. */
    commit: (runId, body) => http.post(`/assignment-runs/${runId}/commit`, body),
    // Manager
    /** Rooms of a committed Block. */
    rooms: (runId, query, opts) => http.get(`/assignment-runs/${runId}/rooms`, query, opts),
    approve: (runId, body) => http.post(`/assignment-runs/${runId}/approve`, body),
    returnToStaff: (runId, body) => http.post(`/assignment-runs/${runId}/return`, body),
  },
  inventory: {
    structure: g('/inventory/structure'),
    /** Rooms and Beds on one floor. */
    floor: g('/inventory/rooms'),
    room: (code, opts) => http.get(`/inventory/rooms/${code}`, undefined, opts),
    setOutOfService: (code, body) => http.post(`/inventory/rooms/${code}/out-of-service`, body),
    backInService: (code) => http.post(`/inventory/rooms/${code}/back-in-service`),
  },
  desk: {
    /** Today's check-in numbers and recent check-ins. */
    checkInToday: g('/check-in/today'),
    /** Find a student by code, name or QR pass payload. */
    checkInLookup: g('/check-in/lookup'),
    checkIn: (body) => http.post('/check-in', body),
    checkOutList: g('/check-out'),
    /** By Allocation id: the student code is personal data and never goes into a URL. */
    checkOutDetail: (allocationId, opts) => http.get(`/check-out/${allocationId}`, undefined, opts),
    checkOut: (allocationId, body) => http.post(`/check-out/${allocationId}`, body),
  },
  meters: {
    periods: g('/meter-periods'),
    list: (periodId, query, opts) => http.get(`/meter-periods/${periodId}/readings`, query, opts),
    /** One Room with its split preview. */
    room: (periodId, room, opts) => http.get(`/meter-periods/${periodId}/readings/${room}`, undefined, opts),
    save: (periodId, room, body) => http.put(`/meter-periods/${periodId}/readings/${room}`, body),
    confirm: (periodId, room) => http.post(`/meter-periods/${periodId}/readings/${room}/confirm`),
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
    assignment: g('/approvals/assignment'),
    lateCheckIns: g('/late-check-ins'),
    decideLateCheckIn: (id, body) => http.post(`/late-check-ins/${id}/decision`, body),
  },
  finance: {
    summary: g('/finance/summary'),
    refunds: g('/refunds'),
    decideRefund: (id, body) => http.post(`/refunds/${id}/decision`, body),
    overdue: g('/finance/overdue'),
    remind: (body) => http.post('/finance/reminders', body),
    invoices: g('/invoices'),
    /** Admin Financial Report. */
    report: g('/reports/financial'),
  },
  blockStaff: {
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
  payments: {
    list: g('/payments'),
    /** Staff confirms a manual transfer (multipart: amount, reference, receipt?). */
    confirm: (invoiceId, formData) => http.post(`/payments/${invoiceId}/confirm`, formData),
  },
  dashboards: {
    staff: g('/dashboards/staff'),
    manager: g('/dashboards/manager'),
    admin: g('/dashboards/admin'),
  },

  /* ---------------------------------------------------------------- Admin configuration */
  admin: {
    terms: {
      list: g('/admin/terms'),
      create: (body) => http.post('/admin/terms', body),
      update: (id, body) => http.put(`/admin/terms/${id}`, body),
      publish: (id, body) => http.post(`/admin/terms/${id}/publish`, body),
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
