package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.inventory.Inventory;

/**
 * Round 2: when a Block is approved, each Waitlisted student who was not
 * flagged ineligible is offered up to three free Beds of other kinds (one per
 * Room Type and Room Class, nearest Term price first), in partly filled Rooms
 * first. The Beds are held until the offer is answered or expires
 * (Admin › System parameters, {@code round2.offer_hours}).
 */
@Component
class Round2Offers {

    private static final int MAX_OPTIONS = 3;

    private final JdbcClient jdbc;
    private final Inventory inventory;
    private final Catalog catalog;
    private final FeePolicy fees;
    private final Applications applications;
    private final Parameters parameters;
    private final Clock clock;

    Round2Offers(JdbcClient jdbc, Inventory inventory, Catalog catalog, FeePolicy fees, Applications applications,
            Parameters parameters, Clock clock) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.catalog = catalog;
        this.fees = fees;
        this.applications = applications;
        this.parameters = parameters;
        this.clock = clock;
    }

    void offer(long termId, List<Applications.Candidate> waitlisted) {
        if (waitlisted.isEmpty()) {
            return;
        }
        Set<Long> occupied = Set.copyOf(jdbc.sql("SELECT bed_id FROM asg_allocation WHERE term_id = :t AND status = 'ACTIVE'")
                .param("t", termId).query(Long.class).list());
        Set<Long> taken = new HashSet<>(applications.heldRound2Beds(termId));
        List<Inventory.BedSlot> assignable = inventory.assignableBeds();
        Map<Long, Long> occupants = assignable.stream().filter(b -> occupied.contains(b.bedId()))
                .collect(Collectors.groupingBy(Inventory.BedSlot::roomId, Collectors.counting()));
        Map<Long, Integer> bedsPerType = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::beds));
        List<Inventory.BedSlot> ordered = assignable.stream()
                .sorted(Comparator.comparing((Inventory.BedSlot b) -> -occupants.getOrDefault(b.roomId(), 0L))
                        .thenComparing(Inventory.BedSlot::code))
                .toList();
        Instant expires = Instant.now(clock).plus(Duration.ofHours(parameters.intValue("round2.offer_hours")));

        for (Applications.Candidate c : waitlisted.stream()
                .sorted(Comparator.comparing(Applications.Candidate::submittedAt,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList()) {
            Map<String, Inventory.BedSlot> bestPerKind = new LinkedHashMap<>();
            for (Inventory.BedSlot b : ordered) {
                if (b.gender().equals(c.gender()) && !occupied.contains(b.bedId()) && !taken.contains(b.bedId())) {
                    bestPerKind.putIfAbsent(b.roomTypeId() + ":" + b.roomClassId(), b);
                }
            }
            List<Applications.Round2Option> options = new ArrayList<>();
            for (Inventory.BedSlot b : bestPerKind.values()) {
                OptionalLong price = fees.termPrice(b.roomTypeId(), b.roomClassId());
                if (price.isEmpty()) {
                    continue;
                }
                int capacity = Math.max(1, bedsPerType.getOrDefault(b.roomTypeId(), 1));
                options.add(new Applications.Round2Option(b.roomTypeId(), b.roomClassId(), b.buildingId(), b.bedId(),
                        "Room " + b.roomCode(),
                        BigDecimal.valueOf(occupants.getOrDefault(b.roomId(), 0L))
                                .divide(BigDecimal.valueOf(capacity), 4, RoundingMode.HALF_UP),
                        price.getAsLong(), price.getAsLong() - c.termPrice()));
            }
            List<Applications.Round2Option> chosen = options.stream()
                    .sorted(Comparator.comparing((Applications.Round2Option o) -> Math.abs(o.difference()))
                            .thenComparing(Applications.Round2Option::difference))
                    .limit(MAX_OPTIONS).toList();
            if (chosen.isEmpty()) {
                continue;
            }
            chosen.forEach(o -> taken.add(o.bedId()));
            applications.offerRound2(c.applicationId(), chosen, expires);
        }
    }
}
