package vn.fpt.campusstay.exception;

import java.util.Map;

/**
 * Maps database constraint names (see the Flyway migrations) to messages for
 * the user. Services should check business rules first and throw
 * {@link ApiException}; this table is the safety net when two requests race and
 * the database constraint is what stops the second one.
 */
public final class ConstraintMessages {

    public record Entry(String code, String message) {
    }

    private static final Map<String, Entry> ENTRIES = Map.ofEntries(
            Map.entry("ux_auth_user_email", new Entry("EMAIL_TAKEN", "An account with this email already exists.")),
            Map.entry("ex_term_no_overlap", new Entry("TERM_OVERLAP", "The stay dates overlap another published Term.")),
            Map.entry("ux_app_one_live_per_term", new Entry("APPLICATION_EXISTS", "You already have an Application for this Term.")),
            Map.entry("ux_invite_one_pending_per_inviter", new Entry("INVITATION_PENDING", "You already have a pending roommate invitation.")),
            Map.entry("ux_alloc_bed_term", new Entry("BED_TAKEN", "This Bed was just allocated to another student. Choose another Bed.")),
            Map.entry("ux_alloc_student_term", new Entry("ALREADY_ALLOCATED", "This student already has a Bed for this Term.")),
            Map.entry("ux_proposal_bed", new Entry("BED_TAKEN", "This Bed is already used in the proposal.")),
            Map.entry("ux_round2_bed_held", new Entry("BED_HELD", "This Bed is held by another Round-2 offer.")),
            Map.entry("ux_asg_one_live_run", new Entry("RUN_IN_PROGRESS", "An assignment run is already in progress for this Term.")),
            Map.entry("ux_payment_one_confirmed", new Entry("ALREADY_PAID", "This Invoice is already paid.")),
            Map.entry("ux_invoice_one_deposit", new Entry("DEPOSIT_EXISTS", "This Application already has a Deposit Invoice.")),
            Map.entry("ux_rc_one_open", new Entry("ROOM_CHANGE_OPEN", "You already have an open Room-Change Request.")),
            Map.entry("ux_swap_one_open_a", new Entry("SWAP_OPEN", "You already have an open swap request.")),
            Map.entry("ux_swap_post_one_active", new Entry("SWAP_POST_EXISTS", "You already have an active swap post.")),
            Map.entry("ux_escalation_open", new Entry("ESCALATION_OPEN", "This item is already escalated.")),
            Map.entry("ux_floor", new Entry("FLOOR_EXISTS", "This Floor already exists in the Building.")),
            Map.entry("inv_room_code_key", new Entry("ROOM_CODE_TAKEN", "A Room with this code already exists.")),
            Map.entry("inv_building_code_key", new Entry("BLOCK_EXISTS", "A Block with this name already exists.")),
            Map.entry("cfg_term_code_key", new Entry("TERM_EXISTS", "A Term with this name already exists.")),
            Map.entry("cfg_room_type_name_key", new Entry("ROOM_TYPE_EXISTS", "A Room Type with this name already exists.")),
            Map.entry("cfg_room_class_name_key", new Entry("ROOM_CLASS_EXISTS", "A Room Class with this name already exists.")),
            Map.entry("cfg_priority_group_key_key", new Entry("PRIORITY_GROUP_EXISTS", "A priority group with this name already exists.")),
            Map.entry("ux_matching_one_active", new Entry("STALE_DATA", "Someone else saved the matching criteria a moment ago. Reload the page and try again.")));

    private ConstraintMessages() {
    }

    public static Entry find(String constraintName) {
        if (constraintName == null) {
            return null;
        }
        return ENTRIES.get(constraintName.toLowerCase());
    }
}
