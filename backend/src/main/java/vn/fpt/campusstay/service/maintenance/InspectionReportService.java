package vn.fpt.campusstay.service.maintenance;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.inventory.Inventory;

/**
 * Every Room report of the inspections (user decision 25/11/2026): whatever the Manager scheduled (a pre-arrival
 * check, Wi-Fi, fire safety …), each Room an inspector finished is one report, kept with its Room as soon as
 * Staff save it (whether or not the run is sent to the Managers yet). Staff and Managers read them; students never do (they see only their own check-in inventory). The back office's
 * report summary lists them beside the students' check-in inventories, and Rooms and beds shows a Room's own.
 */
@Service
@Transactional(readOnly = true)
public class InspectionReportService {

    /**
     * One inspected Room of a run.
     *
     * @param runId     the run's code ({@code INS-12}); the report opens at /inspections/{runId}/rooms/{room}
     * @param kind      {@code Pre-arrival} or {@code Periodic}
     * @param status    {@code Inspected} or {@code Unreachable}
     * @param submitted the inspector sent the whole run to the Managers
     */
    public record Report(String runId, String room, String block, int floor, String name, String kind, String status,
            Instant inspectedAt, String inspector, long failed, boolean submitted, Instant submittedAt) {
    }

    public record ReportPage(List<Report> items, long total) {
    }

    private record Row(long runId, long roomId, long buildingId, String name, String kind, String status,
            Instant inspectedAt, Long inspectorId, long failed, boolean submitted, Instant submittedAt) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final Inventory inventory;
    private final UserDirectory users;

    public InspectionReportService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, Inventory inventory,
            UserDirectory users) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.inventory = inventory;
        this.users = users;
    }

    /**
     * The finished Room reports of the user's Blocks, newest first.
     *
     * @param room a Room code ({@code A-301}): only that Room's reports
     * @param q    a run code, Room code or inspection name
     * @param kind {@code Pre-arrival} (report 1, Staff's check before the students arrive) or {@code Periodic} (Wi-Fi,
     *             fire safety …); none = both
     */
    public ReportPage list(String block, String room, String q, String kind, PageQuery page) {
        currentUser.require(Permission.PROCESS_MAINTENANCE);
        Set<Long> scope = blockScope.resolve(block).ids();
        if (scope.isEmpty()) {
            return new ReportPage(List.of(), 0);
        }
        Map<Long, Inventory.BedSlot> rooms = new HashMap<>();
        scope.forEach(b -> inventory.bedsOfBuilding(b).forEach(s -> rooms.putIfAbsent(s.roomId(), s)));
        List<Long> roomFilter = null;
        if (room != null && !room.isBlank()) {
            String code = room.trim();
            roomFilter = rooms.values().stream().filter(s -> s.roomCode().equalsIgnoreCase(code))
                    .map(Inventory.BedSlot::roomId).toList();
            if (roomFilter.isEmpty()) {
                throw ApiException.notFound("Room " + code + " is not in your Blocks.");
            }
        }
        List<Row> rows = jdbc.sql("""
                SELECT r.id AS run_id, ir.room_id, r.building_id, coalesce(s.name, c.name) AS name,
                       coalesce(s.kind, 'PERIODIC') AS kind, ir.status, ir.inspected_at, r.inspector_id,
                       r.status = 'SUBMITTED' AS submitted, r.submitted_at,
                       (SELECT count(*) FROM mnt_inspection_result x
                        WHERE x.inspection_room_id = ir.id AND x.result = 'FAIL')
                     + (SELECT count(*) FROM mnt_inspection_room_check k
                        WHERE k.inspection_room_id = ir.id AND (k.result = 'FAIL' OR k.condition IN ('DAMAGED', 'MISSING')))
                       AS failed
                FROM mnt_inspection_room ir
                JOIN mnt_inspection_run r ON r.id = ir.run_id
                JOIN mnt_checklist c ON c.id = r.checklist_id
                LEFT JOIN mnt_inspection_schedule s ON s.id = r.schedule_id
                WHERE r.building_id IN (:scope) AND ir.status <> 'PENDING'
                  AND (CAST(:kind AS VARCHAR) IS NULL OR coalesce(s.kind, 'PERIODIC') = :kind)
                ORDER BY coalesce(ir.inspected_at, r.submitted_at, r.created_at) DESC, r.id DESC, ir.id
                """).param("scope", List.copyOf(scope)).param("kind", kindCode(kind))
                .query((rs, i) -> new Row(rs.getLong("run_id"), rs.getLong("room_id"), rs.getLong("building_id"),
                        rs.getString("name"), rs.getString("kind"), rs.getString("status"),
                        rs.getTimestamp("inspected_at") == null ? null : rs.getTimestamp("inspected_at").toInstant(),
                        rs.getObject("inspector_id", Long.class), rs.getLong("failed"), rs.getBoolean("submitted"),
                        rs.getTimestamp("submitted_at") == null ? null : rs.getTimestamp("submitted_at").toInstant()))
                .list();
        List<Long> only = roomFilter;
        String needle = q == null ? "" : q.trim().toLowerCase(java.util.Locale.ROOT);
        List<Row> kept = new ArrayList<>();
        for (Row r : rows) {
            Inventory.BedSlot info = rooms.get(r.roomId());
            if (info == null || only != null && !only.contains(r.roomId())) {
                continue;
            }
            if (!needle.isEmpty() && !("ins-" + r.runId()).contains(needle)
                    && !info.roomCode().toLowerCase(java.util.Locale.ROOT).contains(needle)
                    && !(r.name() != null && r.name().toLowerCase(java.util.Locale.ROOT).contains(needle))) {
                continue;
            }
            kept.add(r);
        }
        List<Row> shown = kept.stream().skip(page.offset()).limit(page.limit()).toList();
        Map<Long, String> names = users.displayNames(shown.stream().map(Row::inspectorId).filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        return new ReportPage(shown.stream().map(r -> {
            Inventory.BedSlot info = rooms.get(r.roomId());
            return new Report("INS-" + r.runId(), info.roomCode(), info.block(), info.floor(), r.name(),
                    "PRE_ARRIVAL".equals(r.kind()) ? "Pre-arrival" : "Periodic",
                    "INSPECTED".equals(r.status()) ? "Inspected" : "Unreachable", r.inspectedAt(),
                    r.inspectorId() == null ? null : names.get(r.inspectorId()), r.failed(), r.submitted(),
                    r.submittedAt());
        }).toList(), kept.size());
    }

    private static String kindCode(String kind) {
        if (kind == null || kind.isBlank()) {
            return null;
        }
        return switch (kind.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "pre-arrival", "pre_arrival", "report 1" -> "PRE_ARRIVAL";
            case "periodic", "other" -> "PERIODIC";
            default -> throw vn.fpt.campusstay.exception.FieldErrors.single("kind", "Choose Pre-arrival or Periodic.");
        };
    }
}
