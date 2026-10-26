package vn.fpt.campusstay.security;

import java.util.EnumSet;
import java.util.Set;

/**
 * Role-by-action rules (second authorization layer). Services check them with
 * {@link CurrentUser#require(Permission)}, and Admin › Users and Roles shows this
 * same table ({@code GET /admin/permissions}), so the matrix cannot drift from
 * what the server enforces. The URL rules in {@code SecurityConfig} agree with it:
 * {@code /admin/**} is Admin only, {@code /students/**} Student only.
 */
public enum Permission {

    APPLY("Apply for a Bed and pay Invoices", Role.STUDENT),
    REPORT_MAINTENANCE("Report Maintenance Requests", Role.STUDENT, Role.STAFF, Role.MANAGER),
    REVIEW_APPLICATIONS("Review Applications", Role.MANAGER),
    CONFIRM_PAYMENTS("Confirm or reject payment claims (one by one or in bulk)", Role.MANAGER),
    RUN_ASSIGNMENT("Run assignment, resolve conflicts and commit", Role.MANAGER),
    APPROVE_ASSIGNMENT("Approve assignment proposals", Role.MANAGER),
    VIEW_INVENTORY("View Rooms and Beds", Role.STAFF, Role.MANAGER, Role.ADMIN),
    SET_ROOM_OUT_OF_SERVICE("Set Rooms out of service", Role.STAFF, Role.MANAGER),
    MANAGE_ROOM_CLASSES("Set the Room Class of Rooms for coming Terms", Role.MANAGER),
    MANAGE_FURNITURE("Furniture: status, Block store and moves inside a Block", Role.STAFF, Role.MANAGER),
    MANAGE_FURNITURE_CATALOGUE("Furniture: register items and transfer them between Blocks", Role.MANAGER),
    MANAGE_DOOR_CODES("Set, change and view the door codes of Rooms", Role.STAFF, Role.MANAGER),
    DESK("Check students in and out", Role.STAFF, Role.MANAGER),
    PROCESS_MAINTENANCE("Process Maintenance Requests", Role.STAFF, Role.MANAGER),
    DECIDE_ROOM_CHANGES("Decide next-Term requests: room changes, swaps, Room Class changes, extensions (Staff inside"
            + " their Blocks)", Role.STAFF, Role.MANAGER),
    MOVE_RESIDENTS("Move residents during a Term for an operational reason (Staff inside their Blocks)", Role.STAFF,
            Role.MANAGER),
    ISSUE_TERM_FEES("Issue the next-Term room fees", Role.MANAGER),
    RECONCILE_ENROLLMENT("Reconcile the enrolled list with residents and applicants", Role.MANAGER),
    DECIDE_REFUNDS("Decide refunds and late check-ins", Role.MANAGER),
    TERMINATE_STAYS("Start and cancel terminations of stays", Role.MANAGER),
    MANAGE_BLOCK("Manage staff, routing and Block settings", Role.MANAGER),
    VIEW_STUDENTS("View student accounts (Staff: residents of their Blocks)", Role.STAFF, Role.MANAGER, Role.ADMIN),
    MANAGE_STUDENTS("Import, verify, lock and edit student accounts", Role.MANAGER, Role.ADMIN),
    MANAGE_STAFF_ACCOUNTS("Create Staff accounts and choose their Blocks", Role.MANAGER, Role.ADMIN),
    VIEW_REPORTS("View reports and exports", Role.MANAGER, Role.ADMIN),
    REQUEST_TERMS("Request registration periods", Role.MANAGER),
    VIEW_REGISTRATION_PERIODS("Read and comment on registration-period requests; Term dashboards", Role.MANAGER,
            Role.ADMIN),
    ANNOUNCE("Write announcements to students (Staff: residents of their Blocks)", Role.STAFF, Role.MANAGER,
            Role.ADMIN),
    CONFIGURE("Configure Terms, prices and rules", Role.ADMIN),
    MANAGE_BUILDINGS("Manage Buildings and Rooms", Role.ADMIN),
    MANAGE_USERS("Manage users and roles", Role.ADMIN),
    READ_AUDIT_LOG("Read the Audit Log", Role.ADMIN);

    private final String action;
    private final Set<Role> roles;

    Permission(String action, Role first, Role... rest) {
        this.action = action;
        this.roles = EnumSet.of(first, rest);
    }

    /** Text shown in the permission matrix. */
    public String action() {
        return action;
    }

    public boolean allows(Role role) {
        return roles.contains(role);
    }
}
