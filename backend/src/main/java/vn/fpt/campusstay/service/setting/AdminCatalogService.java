package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.event.RoomTypeBedsChanged;
import vn.fpt.campusstay.service.setting.RoomUsage;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.entity.RoomClassEntity;
import vn.fpt.campusstay.entity.RoomTypeEntity;
import vn.fpt.campusstay.repository.RoomClassRepository;
import vn.fpt.campusstay.repository.RoomTypeRepository;

/**
 * Admin › Room Types and Room Classes. Term price per Bed = Room Type base price
 * × (1 + Room Class surcharge). Applications keep the price they were submitted
 * with, so changes here never alter issued Invoices.
 */
@Service
public class AdminCatalogService {

    public record RoomTypeItem(String id, String name, int beds, long basePrice, String roommateSelection, long rooms,
            String status, boolean hasAllocations) {
    }

    public record ClassPrice(String id, String name, BigDecimal surchargeRate) {
    }

    public record Totals(long rooms, long beds) {
    }

    public record RoomTypePage(List<RoomTypeItem> items, List<ClassPrice> roomClasses, Totals totals) {
    }

    /** {@code roommateSelection}: {@code auto} or {@code mutual}; {@code status}: {@code Active} or {@code Inactive}. */
    public record RoomTypeValues(String name, Integer beds, Long basePrice, String roommateSelection, String status) {
    }

    public record RoomClassItem(String id, String name, BigDecimal surchargeRate, List<String> amenities, String usedIn,
            long rooms, String status) {
    }

    public record TypePrice(String id, String name, long basePrice) {
    }

    public record RoomClassPage(List<RoomClassItem> items, List<TypePrice> roomTypes, BigDecimal depositRate) {
    }

    public record RoomClassValues(String name, BigDecimal surchargeRate, List<String> amenities, String status) {
    }

    private static final int MAX_BEDS = 12;
    private static final BigDecimal MAX_SURCHARGE = new BigDecimal("5");
    private static final int MAX_AMENITIES = 20;

    private final RoomTypeRepository roomTypes;
    private final RoomClassRepository roomClasses;
    private final RoomUsage usage;
    private final JdbcClient jdbc;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;

    public AdminCatalogService(RoomTypeRepository roomTypes, RoomClassRepository roomClasses, RoomUsage usage,
            JdbcClient jdbc, ApplicationEventPublisher events, AuditLog audit) {
        this.roomTypes = roomTypes;
        this.roomClasses = roomClasses;
        this.usage = usage;
        this.jdbc = jdbc;
        this.events = events;
        this.audit = audit;
    }

    // ---------------------------------------------------------------- Room Types

    @Transactional(readOnly = true)
    public RoomTypePage roomTypes() {
        Map<Long, Long> rooms = usage.roomsByType();
        Set<Long> inUse = usage.roomTypesWithActiveAllocations();
        List<RoomTypeItem> items = new ArrayList<>();
        long totalRooms = 0;
        long totalBeds = 0;
        for (RoomTypeEntity t : roomTypes.findAllOrdered()) {
            long count = rooms.getOrDefault(t.getId(), 0L);
            totalRooms += count;
            totalBeds += count * t.getBeds();
            items.add(new RoomTypeItem(String.valueOf(t.getId()), t.getName(), t.getBeds(), t.getBasePrice(),
                    selectionLabel(t.getRoommateSelection()), count, t.getStatus().label(), inUse.contains(t.getId())));
        }
        List<ClassPrice> classes = roomClasses.findAllOrdered().stream()
                .filter(c -> c.getStatus() == ActiveStatus.ACTIVE)
                .map(c -> new ClassPrice(String.valueOf(c.getId()), c.getName(), Decimals.plain(c.getSurchargeRate())))
                .toList();
        return new RoomTypePage(items, classes, new Totals(totalRooms, totalBeds));
    }

    @Transactional
    public long createRoomType(RoomTypeValues values) {
        Validated v = validate(values, null);
        RoomTypeEntity type = roomTypes.saveAndFlush(new RoomTypeEntity(v.name(), v.beds(), v.basePrice(),
                v.selection(), v.status(), roomTypes.maxSortOrder() + 1));
        audit.record("ROOM_TYPE_CREATED", AuditLog.Tone.INFO, "Room Type", type.getId(), type.getName(),
                Map.of("beds", v.beds(), "basePrice", v.basePrice()));
        return type.getId();
    }

    @Transactional
    public long updateRoomType(long id, RoomTypeValues values) {
        RoomTypeEntity type = roomTypes.findById(id)
                .orElseThrow(() -> ApiException.notFound("This Room Type does not exist."));
        Validated v = validate(values, id);
        int previousBeds = type.getBeds();
        if (v.beds() != previousBeds && usage.roomTypesWithActiveAllocations().contains(id)) {
            throw ApiException.conflict("ROOM_TYPE_IN_USE",
                    "Rooms of this type have active Allocations, so the number of Beds cannot change.");
        }
        Map<String, Object> change = new LinkedHashMap<>();
        put(change, "name", type.getName(), v.name());
        put(change, "beds", previousBeds, v.beds());
        put(change, "basePrice", type.getBasePrice(), v.basePrice());
        put(change, "roommateSelection", selectionLabel(type.getRoommateSelection()), selectionLabel(v.selection()));
        put(change, "status", type.getStatus().label(), v.status().label());
        type.update(v.name(), v.beds(), v.basePrice(), v.selection(), v.status());
        roomTypes.saveAndFlush(type);
        if (v.beds() != previousBeds) {
            events.publishEvent(new RoomTypeBedsChanged(id, previousBeds, v.beds()));
        }
        if (!change.isEmpty()) {
            audit.record("ROOM_TYPE_UPDATED", AuditLog.Tone.INFO, "Room Type", id, type.getName(), change);
        }
        return id;
    }

    private record Validated(String name, int beds, long basePrice, RoomTypeEntity.Selection selection,
            ActiveStatus status) {
    }

    private Validated validate(RoomTypeValues values, Long id) {
        FieldErrors errors = new FieldErrors();
        String name = values.name() == null ? "" : values.name().trim();
        errors.check(!name.isEmpty(), "name", "Enter the Room Type name.");
        errors.check(name.length() <= 50, "name", "Use at most 50 characters.");
        if (!name.isEmpty()) {
            roomTypes.findByNameIgnoreCase(name).filter(other -> !other.getId().equals(id))
                    .ifPresent(other -> errors.add("name", "A Room Type with this name already exists."));
        }
        Integer beds = values.beds();
        errors.check(beds != null && beds >= 1 && beds <= MAX_BEDS, "beds", "Enter 1 to " + MAX_BEDS + " Beds.");
        errors.check(values.basePrice() != null && values.basePrice() > 0, "basePrice", "Enter a price above 0.");
        RoomTypeEntity.Selection selection = parseSelection(values.roommateSelection());
        errors.check(selection != null, "roommateSelection", "Choose auto or mutual.");
        if (selection == RoomTypeEntity.Selection.MUTUAL && beds != null && beds != 2) {
            errors.add("roommateSelection", "Only Room Types with 2 Beds can allow mutual invite.");
        }
        ActiveStatus status = ActiveStatus.parse(values.status()).orElse(null);
        errors.check(status != null, "status", "Choose Active or Inactive.");
        errors.throwIfAny();
        return new Validated(name, beds, values.basePrice(), selection, status);
    }

    private static RoomTypeEntity.Selection parseSelection(String value) {
        if (value == null || value.isBlank() || value.trim().equalsIgnoreCase("auto")) {
            return RoomTypeEntity.Selection.AUTO;
        }
        return value.trim().equalsIgnoreCase("mutual") ? RoomTypeEntity.Selection.MUTUAL : null;
    }

    private static String selectionLabel(RoomTypeEntity.Selection selection) {
        return selection == RoomTypeEntity.Selection.MUTUAL ? "mutual" : "auto";
    }

    // ---------------------------------------------------------------- Room Classes

    @Transactional(readOnly = true)
    public RoomClassPage roomClasses() {
        Map<Long, RoomUsage.ClassUsage> byClass = usage.usageByClass();
        List<RoomClassItem> items = roomClasses.findAllOrdered().stream()
                .map(c -> {
                    RoomUsage.ClassUsage u = byClass.get(c.getId());
                    return new RoomClassItem(String.valueOf(c.getId()), c.getName(),
                            Decimals.plain(c.getSurchargeRate()), c.getAmenities(), u == null ? null : u.usedIn(),
                            u == null ? 0 : u.rooms(), c.getStatus().label());
                })
                .toList();
        List<TypePrice> types = roomTypes.findAllOrdered().stream()
                .filter(t -> t.getStatus() == ActiveStatus.ACTIVE)
                .map(t -> new TypePrice(String.valueOf(t.getId()), t.getName(), t.getBasePrice()))
                .toList();
        BigDecimal depositPercent = jdbc.sql("SELECT deposit_percent FROM cfg_fee_policy WHERE id = 1")
                .query(BigDecimal.class).single();
        return new RoomClassPage(items, types, Decimals.plain(depositPercent.movePointLeft(2)));
    }

    @Transactional
    public long createRoomClass(RoomClassValues values) {
        ValidatedClass v = validate(values, null);
        RoomClassEntity roomClass = roomClasses.saveAndFlush(new RoomClassEntity(v.name(), v.surchargeRate(),
                v.amenities(), v.status(), roomClasses.maxSortOrder() + 1));
        audit.record("ROOM_CLASS_CREATED", AuditLog.Tone.INFO, "Room Class", roomClass.getId(), roomClass.getName(),
                Map.of("surchargeRate", Decimals.plain(v.surchargeRate())));
        return roomClass.getId();
    }

    @Transactional
    public long updateRoomClass(long id, RoomClassValues values) {
        RoomClassEntity roomClass = roomClasses.findById(id)
                .orElseThrow(() -> ApiException.notFound("This Room Class does not exist."));
        ValidatedClass v = validate(values, id);
        Map<String, Object> change = new LinkedHashMap<>();
        put(change, "name", roomClass.getName(), v.name());
        put(change, "surchargeRate", Decimals.plain(roomClass.getSurchargeRate()), Decimals.plain(v.surchargeRate()));
        put(change, "amenities", roomClass.getAmenities(), v.amenities());
        put(change, "status", roomClass.getStatus().label(), v.status().label());
        roomClass.update(v.name(), v.surchargeRate(), v.amenities(), v.status());
        roomClasses.saveAndFlush(roomClass);
        if (!change.isEmpty()) {
            audit.record("ROOM_CLASS_UPDATED", AuditLog.Tone.INFO, "Room Class", id, roomClass.getName(), change);
        }
        return id;
    }

    private record ValidatedClass(String name, BigDecimal surchargeRate, List<String> amenities, ActiveStatus status) {
    }

    private ValidatedClass validate(RoomClassValues values, Long id) {
        FieldErrors errors = new FieldErrors();
        String name = values.name() == null ? "" : values.name().trim();
        errors.check(!name.isEmpty(), "name", "Enter the Room Class name.");
        errors.check(name.length() <= 50, "name", "Use at most 50 characters.");
        if (!name.isEmpty()) {
            roomClasses.findByNameIgnoreCase(name).filter(other -> !other.getId().equals(id))
                    .ifPresent(other -> errors.add("name", "A Room Class with this name already exists."));
        }
        BigDecimal rate = values.surchargeRate();
        errors.check(rate != null && rate.signum() >= 0 && rate.compareTo(MAX_SURCHARGE) <= 0, "surchargeRate",
                "Enter a surcharge from 0% to 500%.");
        List<String> amenities = values.amenities() == null ? List.of()
                : values.amenities().stream().filter(Objects::nonNull).map(String::trim).filter(a -> !a.isEmpty())
                        .distinct().toList();
        errors.check(amenities.size() <= MAX_AMENITIES, "amenities", "List at most " + MAX_AMENITIES + " amenities.");
        errors.check(amenities.stream().allMatch(a -> a.length() <= 100), "amenities",
                "Keep each amenity under 100 characters.");
        ActiveStatus status = ActiveStatus.parse(values.status()).orElse(null);
        errors.check(status != null, "status", "Choose Active or Inactive.");
        errors.throwIfAny();
        return new ValidatedClass(name, rate.setScale(4, RoundingMode.HALF_UP), amenities, status);
    }

    private static void put(Map<String, Object> change, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            change.put(field, List.of(String.valueOf(before), String.valueOf(after)));
        }
    }
}
