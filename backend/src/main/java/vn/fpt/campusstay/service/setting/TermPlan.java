package vn.fpt.campusstay.service.setting;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * What a registration-period request proposes and what the wizard builds from it (spec §6.3, §6.4). Fields may be
 * null: a request sends what the Manager knows, a Draft fills in step by step; {@link TermTimelines} says what is
 * missing or out of order.
 */
public final class TermPlan {

    private TermPlan() {
    }

    /**
     * The milestones of spec §5.1. Renewal milestones (M1 {@code publishAt} … M7 {@code feesDueAt}) are for the
     * continuing residents of the Term before it; registration milestones for new students.
     */
    public record Timeline(Instant publishAt, Instant requestsOpenAt, Instant requestsCloseAt, Instant decisionsDueAt,
            Instant reconciliationDueAt, Instant feesIssueAt, Instant feesDueAt, Instant registrationOpensAt,
            Instant registrationClosesAt, Instant resultsPublishedAt, Integer roommateHours, Integer depositHours,
            Instant balanceDueAt, LocalDate checkInStart, LocalDate checkInEnd, LocalDate checkOutBy) {

        public static Timeline empty() {
            return new Timeline(null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null);
        }

        /** Whether any renewal milestone is filled in. */
        public boolean hasRenewal() {
            return publishAt != null || requestsOpenAt != null || requestsCloseAt != null || decisionsDueAt != null
                    || reconciliationDueAt != null || feesIssueAt != null || feesDueAt != null;
        }
    }

    /** Places the Manager wants for new students of one Room Type × Room Class × gender ({@code M} or {@code F}). */
    public record Places(String roomTypeId, String roomClassId, String gender, Integer places) {
    }

    /** A price per Bed of one Room Type × Room Class. */
    public record Price(String roomTypeId, String roomClassId, Long price) {
    }

    /** A question students ask, with its answer (Registration period details › FAQ). */
    public record Faq(String question, String answer) {
    }

    /** A document students can open (a link to the dormitory rules, a form …). */
    public record Document(String title, String url) {
    }

    /**
     * A value the Admin built differently from the Manager's proposal (spec §6.3 step 4: the Manager sees each one).
     *
     * @param field  key of the value ({@code registrationOpensAt}, {@code price:<roomTypeId>:<roomClassId>} …)
     * @param label  English label ("Registration opens", "Price · 4-bed · Standard")
     * @param type   how to show the values (see {@code event.ValueChange})
     * @param reason why the Admin changed it; null until given
     */
    public record Difference(String field, String label, String type, String proposed, String built, String reason) {
    }

    /**
     * A Manager's proposal.
     *
     * @param blocks        codes of the Blocks to use; empty = every active Block
     * @param excludedRooms Room codes to leave out
     */
    public record Proposal(Timeline timeline, List<String> blocks, List<String> excludedRooms, List<Places> places,
            List<Price> prices) {
    }
}
