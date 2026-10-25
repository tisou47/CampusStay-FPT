package vn.fpt.campusstay.service.setting;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

/**
 * Compares the Term the Admin built with the Manager's request (spec §6.3 step 4): every value the Manager proposed
 * and the Term has differently, with the reason the Admin gave. Values the Manager left empty are not differences.
 */
@Component
class TermDifferences {

    private final Catalog catalog;
    private final TermSupply supply;

    TermDifferences(Catalog catalog, TermSupply supply) {
        this.catalog = catalog;
        this.supply = supply;
    }

    List<TermPlan.Difference> of(TermDrafts.Term term, String proposedName, LocalDate proposedStart,
            LocalDate proposedEnd, TermPlan.Proposal proposal) {
        List<TermPlan.Difference> result = new ArrayList<>();
        Map<String, String> reasons = term.changeReasons();
        add(result, reasons, "name", proposedName, term.name());
        add(result, reasons, "stayStart", text(proposedStart), text(term.stayStart()));
        add(result, reasons, "stayEnd", text(proposedEnd), text(term.stayEnd()));
        TermPlan.Timeline p = proposal.timeline() == null ? TermPlan.Timeline.empty() : proposal.timeline();
        TermPlan.Timeline b = term.timeline();
        add(result, reasons, "publishAt", text(p.publishAt()), text(b.publishAt()));
        add(result, reasons, "requestsOpenAt", text(p.requestsOpenAt()), text(b.requestsOpenAt()));
        add(result, reasons, "requestsCloseAt", text(p.requestsCloseAt()), text(b.requestsCloseAt()));
        add(result, reasons, "decisionsDueAt", text(p.decisionsDueAt()), text(b.decisionsDueAt()));
        add(result, reasons, "reconciliationDueAt", text(p.reconciliationDueAt()), text(b.reconciliationDueAt()));
        add(result, reasons, "feesIssueAt", text(p.feesIssueAt()), text(b.feesIssueAt()));
        add(result, reasons, "feesDueAt", text(p.feesDueAt()), text(b.feesDueAt()));
        add(result, reasons, "registrationOpensAt", text(p.registrationOpensAt()), text(b.registrationOpensAt()));
        add(result, reasons, "registrationClosesAt", text(p.registrationClosesAt()), text(b.registrationClosesAt()));
        add(result, reasons, "resultsPublishedAt", text(p.resultsPublishedAt()), text(b.resultsPublishedAt()));
        add(result, reasons, "roommateHours", text(p.roommateHours()), text(b.roommateHours()));
        add(result, reasons, "depositHours", text(p.depositHours()), text(b.depositHours()));
        add(result, reasons, "balanceDueAt", text(p.balanceDueAt()), text(b.balanceDueAt()));
        add(result, reasons, "checkInStart", text(p.checkInStart()), text(b.checkInStart()));
        add(result, reasons, "checkInEnd", text(p.checkInEnd()), text(b.checkInEnd()));
        add(result, reasons, "checkOutBy", text(p.checkOutBy()), text(b.checkOutBy()));

        Map<Long, String> blockCodes = supply.blocks().stream()
                .collect(Collectors.toMap(TermSupply.Block::id, TermSupply.Block::code));
        if (proposal.blocks() != null && !proposal.blocks().isEmpty()) {
            add(result, reasons, "blocks", codes(proposal.blocks()),
                    term.blocks().isEmpty() ? "All Blocks" : codes(term.blocks().stream().map(blockCodes::get).toList()));
        }
        if (proposal.excludedRooms() != null && !proposal.excludedRooms().isEmpty()) {
            add(result, reasons, "excludedRooms", codes(proposal.excludedRooms()),
                    codes(supply.roomCodes(term.excludedRooms()).values()));
        }
        Map<Long, String> types = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));
        Map<Long, String> classes = catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
        for (TermPlan.Price price : proposal.prices() == null ? List.<TermPlan.Price>of() : proposal.prices()) {
            if (price.price() == null) {
                continue;
            }
            String key = price.roomTypeId() + ":" + price.roomClassId();
            Long built = term.prices().get(key);
            if (!Objects.equals(built, price.price())) {
                String field = "price:" + key;
                result.add(new TermPlan.Difference(field, "Price · " + types.get(Long.valueOf(price.roomTypeId())) + " · "
                        + classes.get(Long.valueOf(price.roomClassId())), "MONEY", String.valueOf(price.price()),
                        built == null ? null : String.valueOf(built), reasons.get(field)));
            }
        }
        return result;
    }

    private static void add(List<TermPlan.Difference> out, Map<String, String> reasons, String field, String proposed,
            String built) {
        if (proposed != null && !proposed.equals(built)) {
            out.add(new TermPlan.Difference(field, TermDrafts.LABELS.get(field), TermDrafts.TYPES.get(field), proposed,
                    built, reasons.get(field)));
        }
    }

    private static String text(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    /** {@code [a-102, A-101]} → {@code A-101, A-102}. */
    static String codes(Collection<String> codes) {
        Set<String> sorted = new TreeSet<>();
        codes.stream().filter(Objects::nonNull).map(c -> c.trim().toUpperCase(Locale.ROOT)).forEach(sorted::add);
        return sorted.isEmpty() ? "None" : String.join(", ", sorted);
    }
}
