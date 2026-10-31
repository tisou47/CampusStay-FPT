package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
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

    /** A Manager's base price per Bed of one Room Type (review R-02: prices are proposed as base × surcharge). */
    public record BasePrice(String roomTypeId, Long price) {
    }

    /** A Manager's surcharge of one Room Class, in percent ({@code 15} = +15%). */
    public record Surcharge(String roomClassId, BigDecimal percent) {
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
     * @param blocks             codes of the Blocks to use; empty = every active Block
     * @param excludedRooms      Room codes to leave out
     * @param prices             price per Bed of each Room Type × Room Class; with {@code basePrices} and
     *                           {@code surcharges} the server computes them (BR-10), so a request reads like any other
     * @param roomTypes          ids of the Room Types to offer; null or empty = every active one (same for roomClasses)
     * @param reservedNewPercent share of the Beds kept for new students, in percent; null = the default
     * @param depositPercent     Deposit in percent of the Term price; null = the default (same for utilityDeposit)
     * @param houseRules         house rules students read for this Term; null = the Term before's (same for faq)
     */
    public record Proposal(Timeline timeline, List<String> blocks, List<String> excludedRooms, List<Places> places,
            List<Price> prices, List<BasePrice> basePrices, List<Surcharge> surcharges, List<String> roomTypes,
            List<String> roomClasses, BigDecimal reservedNewPercent, BigDecimal depositPercent, Long utilityDeposit,
            String houseRules, List<Faq> faq) {
    }
}
