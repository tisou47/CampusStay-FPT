package vn.fpt.campusstay.service.inventory;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.DoorCodeActivated;
import vn.fpt.campusstay.event.DoorCodeChanged;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;

/**
 * Door codes (ADR-23, spec §6.8): one 6-digit code per Room, set by the Block's Staff. A code is proposed
 * (typed, imported or drawn at random), set on the lock, then confirmed: it becomes the Room's code, the
 * previous one is retired and the residents are told (without the code). Codes are stored encrypted
 * ({@link DoorCodeCipher}) and every view is written to the Audit Log.
 * <p>Release to students (phase 5): Assignment releases the code to a resident once the Balance is paid, the
 * Term's check-in start has come and the Room's code is confirmed with no change waiting; a confirmed code is
 * released to the paid residents who waited for it ({@link DoorCodeActivated}). A terminated student past the
 * move-out date no longer sees it.
 */
@Service
public class DoorCodeService {

    public record Task(String reason, Instant since) {
    }

    /**
     * @param status   Change needed (a resident left), Not set or Active
     * @param proposed a new code waits to be confirmed on the lock
     */
    public record DoorCodeItem(String room, String block, int floor, String status, boolean proposed,
            Instant proposedAt, Instant activeSince, Task task, int residents) {
    }

    public record Counts(long toChange, long notSet, long proposed, long active) {
    }

    public record DoorCodePage(List<DoorCodeItem> items, long total, Counts counts, List<String> statuses) {
    }

    public record Proposed(String room, String code) {
    }

    public record Revealed(String room, String active, String proposed) {
    }

    public record Imported(int proposed) {
    }

    /** {@code status}: Ready, Not ready or Not set. */
    public record MyDoorCode(String room, String status, String note, Instant changedAt) {
    }

    public record MyCode(String room, String code, Instant changedAt) {
    }

    static final String CHANGE_NEEDED = "Change needed";
    static final String NOT_SET = "Not set";
    static final String ACTIVE = "Active";
    static final String WAITING = "Waiting for confirmation";
    private static final Map<String, String> TASK_REASONS = Map.of("CHECK_OUT", "Check-out", "MOVE_OUT", "Moved out",
            "TERMINATION", "Termination overdue");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final int MAX_IMPORT_LINES = 2000;
    private static final int MAX_LINE_PROBLEMS = 10;

    private record Room(long id, String code, long buildingId) {
    }

    private record Code(long id, String cipher, Instant confirmedAt) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BedOccupancy occupancy;
    private final DoorCodeCipher cipher;
    private final AuditLog audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public DoorCodeService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BedOccupancy occupancy,
            DoorCodeCipher cipher, AuditLog audit, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.occupancy = occupancy;
        this.cipher = cipher;
        this.audit = audit;
        this.events = events;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- Staff and Managers

    /** @param status a label of {@code statuses}; Waiting for confirmation = a proposed code */
    @Transactional(readOnly = true)
    public DoorCodePage list(String block, String status, String q, PageQuery page) {
        currentUser.require(Permission.MANAGE_DOOR_CODES);
        BlockSelection scope = blockScope.resolve(block);
        record Row(long roomId, String room, String block, int floor, Instant activeSince, Instant proposedAt,
                String taskReason, Instant taskSince) {
        }
        Map<String, Object> params = new HashMap<>();
        params.put("b", List.copyOf(scope.ids()));
        String filter = "";
        if (q != null && !q.isBlank()) {
            filter = " AND upper(r.code) LIKE :q";
            params.put("q", "%" + q.trim().toUpperCase(Locale.ROOT) + "%");
        }
        List<Row> rows = jdbc.sql("""
                SELECT r.id, r.code, b.code AS block, f.floor_no, a.confirmed_at, p.proposed_at, t.reason, t.created_at
                FROM inv_room r JOIN inv_building b ON b.id = r.building_id JOIN inv_floor f ON f.id = r.floor_id
                LEFT JOIN inv_door_code a ON a.room_id = r.id AND a.status = 'ACTIVE'
                LEFT JOIN inv_door_code p ON p.room_id = r.id AND p.status = 'PROPOSED'
                LEFT JOIN inv_door_code_task t ON t.room_id = r.id AND t.done_at IS NULL
                WHERE r.building_id IN (:b) AND r.status <> 'RETIRED'""" + filter + """

                ORDER BY (t.id IS NULL), (a.id IS NOT NULL), b.code, r.code
                """)
                .params(params)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getString("code"), rs.getString("block"),
                        rs.getInt("floor_no"), instant(rs, "confirmed_at"), instant(rs, "proposed_at"),
                        rs.getString("reason"), instant(rs, "created_at")))
                .list();
        long toChange = rows.stream().filter(r -> r.taskReason() != null).count();
        long notSet = rows.stream().filter(r -> r.taskReason() == null && r.activeSince() == null).count();
        long proposed = rows.stream().filter(r -> r.proposedAt() != null).count();
        Counts counts = new Counts(toChange, notSet, proposed, rows.size() - toChange - notSet);
        String wanted = status == null ? "" : status.trim();
        List<Row> shown = rows.stream().filter(r -> wanted.isEmpty()
                || (wanted.equalsIgnoreCase(WAITING) ? r.proposedAt() != null
                        : statusOf(r.taskReason(), r.activeSince()).equalsIgnoreCase(wanted)))
                .toList();
        List<Row> pageRows = shown.stream().skip(page.offset()).limit(page.limit()).toList();
        Map<Long, Integer> residents = residentsPerRoom(pageRows.stream().map(Row::roomId).toList());
        List<DoorCodeItem> items = pageRows.stream()
                .map(r -> new DoorCodeItem(r.room(), r.block(), r.floor(), statusOf(r.taskReason(), r.activeSince()),
                        r.proposedAt() != null, r.proposedAt(), r.activeSince(),
                        r.taskReason() == null ? null : new Task(TASK_REASONS.get(r.taskReason()), r.taskSince()),
                        residents.getOrDefault(r.roomId(), 0)))
                .toList();
        return new DoorCodePage(items, shown.size(), counts, List.of(CHANGE_NEEDED, NOT_SET, WAITING, ACTIVE));
    }

    /** Proposes a new code for the Room: the given 6 digits, or a random code when {@code code} is blank. */
    @Transactional
    public Proposed propose(String roomCode, String code) {
        currentUser.require(Permission.MANAGE_DOOR_CODES);
        cipher.requireEnabled();
        Room room = room(roomCode);
        String current = active(room.id()).map(c -> cipher.decrypt(c.cipher())).orElse(null);
        String source;
        String value;
        if (code == null || code.isBlank()) {
            source = "RANDOM";
            do {
                value = cipher.random();
            } while (value.equals(current));
        } else {
            source = "MANUAL";
            value = code.trim();
            FieldErrors errors = new FieldErrors();
            errors.check(value.matches("\\d{6}"), "code", "Enter 6 digits.");
            errors.check(!value.equals(current), "code", "Choose a code different from the current one.");
            errors.throwIfAny();
        }
        insertProposal(room, value, source);
        audit.record("DOOR_CODE_PROPOSED", AuditLog.Tone.INFO, "Room", room.id(), room.code(),
                Map.of("source", sourceLabel(source)));
        return new Proposed(room.code(), value);
    }

    /** The proposed code is on the lock: it becomes the Room's code and the residents are told. */
    @Transactional
    public void confirm(String roomCode) {
        currentUser.require(Permission.MANAGE_DOOR_CODES);
        Room room = room(roomCode);
        long proposal = proposal(room.id()).map(Code::id)
                .orElseThrow(() -> ApiException.conflict("NO_PROPOSED_CODE",
                        "Room " + room.code() + " has no new door code to confirm."));
        Timestamp now = Timestamp.from(Instant.now(clock));
        jdbc.sql("UPDATE inv_door_code SET status = 'RETIRED', ended_at = :now WHERE room_id = :room AND status = 'ACTIVE'")
                .param("now", now).param("room", room.id()).update();
        jdbc.sql("""
                UPDATE inv_door_code SET status = 'ACTIVE', confirmed_by = :by, confirmed_at = :now WHERE id = :id
                """).param("by", currentUser.id()).param("now", now).param("id", proposal).update();
        jdbc.sql("UPDATE inv_door_code_task SET done_at = :now, door_code_id = :code WHERE room_id = :room AND done_at IS NULL")
                .param("now", now).param("code", proposal).param("room", room.id()).update();
        audit.record("DOOR_CODE_CONFIRMED", AuditLog.Tone.SUCCESS, "Room", room.id(), room.code(), null);
        List<Long> holders = List.copyOf(occupancy.codeHolders(bedsOf(room.id())));
        if (!holders.isEmpty()) {
            events.publishEvent(new DoorCodeChanged(room.code(), holders));
        }
        // Paid residents who waited for a confirmed code receive it now (Assignment, same transaction).
        events.publishEvent(new DoorCodeActivated(room.id(), room.code()));
    }

    @Transactional
    public void cancel(String roomCode) {
        currentUser.require(Permission.MANAGE_DOOR_CODES);
        Room room = room(roomCode);
        int cancelled = jdbc.sql("""
                UPDATE inv_door_code SET status = 'CANCELLED', ended_at = :now WHERE room_id = :room AND status = 'PROPOSED'
                """).param("now", Timestamp.from(Instant.now(clock))).param("room", room.id()).update();
        if (cancelled == 0) {
            throw ApiException.conflict("NO_PROPOSED_CODE", "Room " + room.code() + " has no new door code to confirm.");
        }
        audit.record("DOOR_CODE_CANCELLED", AuditLog.Tone.INFO, "Room", room.id(), room.code(), null);
    }

    /** The Room's current and proposed codes; the view is written to the Audit Log. */
    @Transactional
    public Revealed reveal(String roomCode) {
        currentUser.require(Permission.MANAGE_DOOR_CODES);
        cipher.requireEnabled();
        Room room = room(roomCode);
        String active = active(room.id()).map(c -> cipher.decrypt(c.cipher())).orElse(null);
        String proposed = proposal(room.id()).map(c -> cipher.decrypt(c.cipher())).orElse(null);
        audit.record("DOOR_CODE_VIEWED", AuditLog.Tone.WARNING, "Room", room.id(), room.code(), null);
        return new Revealed(room.code(), active, proposed);
    }

    /**
     * CSV {@code room,code} (header optional): every line is checked first; each becomes the Room's proposed
     * code, to be confirmed once it is on the lock.
     */
    @Transactional
    public Imported importCsv(byte[] file) {
        currentUser.require(Permission.MANAGE_DOOR_CODES);
        cipher.requireEnabled();
        if (file == null || file.length == 0) {
            throw FieldErrors.single("file", "Choose a CSV file.");
        }
        BlockSelection scope = blockScope.resolve(null);
        Map<String, Room> rooms = new HashMap<>();
        jdbc.sql("SELECT id, code, building_id FROM inv_room WHERE building_id IN (:b) AND status <> 'RETIRED'")
                .param("b", List.copyOf(scope.ids()))
                .query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id")))
                .list()
                .forEach(r -> rooms.put(r.code().toUpperCase(Locale.ROOT), r));
        record Line(Room room, String code) {
        }
        List<Line> lines = new ArrayList<>();
        FieldErrors problems = new FieldErrors();
        int problemCount = 0;
        Set<Long> seen = new HashSet<>();
        try (BufferedReader in = new BufferedReader(new StringReader(new String(file, StandardCharsets.UTF_8)))) {
            String text;
            int n = 0;
            while ((text = in.readLine()) != null) {
                n++;
                String[] cells = text.replace("﻿", "").split("[,;\t]");
                if (text.isBlank() || (n == 1 && cells[0].trim().equalsIgnoreCase("room"))) {
                    continue;
                }
                String problem = null;
                Room room = rooms.get(cells[0].trim().toUpperCase(Locale.ROOT));
                String code = cells.length < 2 ? "" : cells[1].trim();
                if (room == null) {
                    problem = "Line " + n + ": Room " + cells[0].trim() + " is not one of your Rooms.";
                } else if (!code.matches("\\d{6}")) {
                    problem = "Line " + n + ": the code must be 6 digits.";
                } else if (!seen.add(room.id())) {
                    problem = "Line " + n + ": Room " + room.code() + " is in the file twice.";
                } else if (code.equals(active(room.id()).map(c -> cipher.decrypt(c.cipher())).orElse(null))) {
                    problem = "Line " + n + ": this is the current code of Room " + room.code() + ".";
                }
                if (problem != null) {
                    if (++problemCount <= MAX_LINE_PROBLEMS) {
                        problems.add("line" + n, problem);
                    }
                } else {
                    lines.add(new Line(room, code));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (!problems.isEmpty()) {
            problems.throwIfAny();
        }
        if (lines.isEmpty()) {
            throw FieldErrors.single("file", "The file has no Room and code lines.");
        }
        if (lines.size() > MAX_IMPORT_LINES) {
            throw FieldErrors.single("file", "Import at most " + MAX_IMPORT_LINES + " Rooms at a time.");
        }
        for (Line l : lines) {
            insertProposal(l.room(), l.code(), "IMPORT");
            audit.record("DOOR_CODE_PROPOSED", AuditLog.Tone.INFO, "Room", l.room().id(), l.room().code(),
                    Map.of("source", sourceLabel("IMPORT")));
        }
        return new Imported(lines.size());
    }

    // ---------------------------------------------------------------- the student

    @Transactional(readOnly = true)
    public MyDoorCode mine() {
        currentUser.require(Role.STUDENT);
        return myRoom().view();
    }

    /** The code of the student's Room; the view is written to the Audit Log. */
    @Transactional
    public MyCode revealMine() {
        currentUser.require(Role.STUDENT);
        MyRoom room = myRoom();
        if (!"Ready".equals(room.view().status())) {
            throw ApiException.conflict("DOOR_CODE_NOT_READY", "Your door code is not ready yet.");
        }
        cipher.requireEnabled();
        Code code = active(room.roomId()).orElseThrow();
        audit.record("DOOR_CODE_VIEWED", AuditLog.Tone.INFO, "Room", room.roomId(), room.view().room(), null);
        return new MyCode(room.view().room(), cipher.decrypt(code.cipher()), code.confirmedAt());
    }

    private record MyRoom(long roomId, MyDoorCode view) {
    }

    private MyRoom myRoom() {
        long me = currentUser.id();
        BedOccupancy.Stay stay = occupancy.currentStay(me)
                .orElseThrow(() -> ApiException.notFound("You do not hold a Bed this Term."));
        Room room = jdbc.sql("""
                SELECT r.id, r.code, r.building_id FROM inv_bed b JOIN inv_room r ON r.id = b.room_id WHERE b.id = :bed
                """).param("bed", stay.bedId())
                .query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id"))).single();
        if (!stay.codeReleased()) {
            String note = switch (stay.waitingFor()) {
                case "PAYMENT" -> "You receive the door code once your Balance is paid.";
                case "CHECK_IN_START" -> "You receive the door code on " + DAY.format(stay.checkInStart())
                        + ", when check-in starts.";
                case "TERMINATED" -> "Your stay is terminated and its move-out date has passed.";
                default -> "Staff are setting the door code of your Room. You will be told when it is ready.";
            };
            return new MyRoom(room.id(), new MyDoorCode(room.code(), "Not ready", note, null));
        }
        Optional<Code> active = active(room.id());
        if (active.isEmpty()) {
            return new MyRoom(room.id(), new MyDoorCode(room.code(), NOT_SET,
                    "Staff have not set the door code of your Room yet.", null));
        }
        return new MyRoom(room.id(), new MyDoorCode(room.code(), "Ready", null, active.get().confirmedAt()));
    }

    // ---------------------------------------------------------------- helpers

    /** For the Room hub: the code's state without the code. */
    DoorCodeItem summary(long roomId) {
        record Row(String room, String block, int floor, Instant activeSince, Instant proposedAt, String reason,
                Instant since) {
        }
        Row r = jdbc.sql("""
                SELECT r.code, b.code AS block, f.floor_no, a.confirmed_at, p.proposed_at, t.reason, t.created_at
                FROM inv_room r JOIN inv_building b ON b.id = r.building_id JOIN inv_floor f ON f.id = r.floor_id
                LEFT JOIN inv_door_code a ON a.room_id = r.id AND a.status = 'ACTIVE'
                LEFT JOIN inv_door_code p ON p.room_id = r.id AND p.status = 'PROPOSED'
                LEFT JOIN inv_door_code_task t ON t.room_id = r.id AND t.done_at IS NULL
                WHERE r.id = :room
                """).param("room", roomId)
                .query((rs, i) -> new Row(rs.getString("code"), rs.getString("block"), rs.getInt("floor_no"),
                        instant(rs, "confirmed_at"), instant(rs, "proposed_at"), rs.getString("reason"),
                        instant(rs, "created_at")))
                .single();
        return new DoorCodeItem(r.room(), r.block(), r.floor(), statusOf(r.reason(), r.activeSince()),
                r.proposedAt() != null, r.proposedAt(), r.activeSince(),
                r.reason() == null ? null : new Task(TASK_REASONS.get(r.reason()), r.since()),
                residentsPerRoom(List.of(roomId)).getOrDefault(roomId, 0));
    }

    private void insertProposal(Room room, String code, String source) {
        Timestamp now = Timestamp.from(Instant.now(clock));
        jdbc.sql("UPDATE inv_door_code SET status = 'CANCELLED', ended_at = :now WHERE room_id = :room AND status = 'PROPOSED'")
                .param("now", now).param("room", room.id()).update();
        jdbc.sql("""
                INSERT INTO inv_door_code (room_id, code_cipher, status, source, proposed_by, proposed_at)
                VALUES (:room, :cipher, 'PROPOSED', :source, :by, :now)
                """)
                .param("room", room.id()).param("cipher", cipher.encrypt(code)).param("source", source)
                .param("by", currentUser.id()).param("now", now)
                .update();
    }

    /** A Room in the user's Blocks, locked for the change. */
    private Room room(String code) {
        Room room = jdbc.sql("""
                SELECT id, code, building_id FROM inv_room WHERE upper(code) = upper(:code) AND status <> 'RETIRED'
                FOR UPDATE
                """)
                .param("code", code == null ? "" : code.trim())
                .query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id")))
                .optional()
                .orElseThrow(() -> ApiException.notFound("Room " + code + " does not exist."));
        blockScope.check(room.buildingId());
        return room;
    }

    private Optional<Code> active(long roomId) {
        return code(roomId, "ACTIVE");
    }

    private Optional<Code> proposal(long roomId) {
        return code(roomId, "PROPOSED");
    }

    private Optional<Code> code(long roomId, String status) {
        return jdbc.sql("SELECT id, code_cipher, confirmed_at FROM inv_door_code WHERE room_id = :room AND status = :status")
                .param("room", roomId).param("status", status)
                .query((rs, i) -> new Code(rs.getLong("id"), rs.getString("code_cipher"), instant(rs, "confirmed_at")))
                .optional();
    }

    private List<Long> bedsOf(long roomId) {
        return jdbc.sql("SELECT id FROM inv_bed WHERE room_id = :room").param("room", roomId).query(Long.class).list();
    }

    private Map<Long, Integer> residentsPerRoom(List<Long> roomIds) {
        Map<Long, Integer> result = new LinkedHashMap<>();
        if (roomIds.isEmpty()) {
            return result;
        }
        Map<Long, Long> roomOfBed = new HashMap<>();
        jdbc.sql("SELECT id, room_id FROM inv_bed WHERE room_id IN (:rooms)").param("rooms", roomIds)
                .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getLong("room_id"))).list()
                .forEach(e -> roomOfBed.put(e.getKey(), e.getValue()));
        occupancy.residents(roomOfBed.keySet()).keySet()
                .forEach(bed -> result.merge(roomOfBed.get(bed), 1, Integer::sum));
        return result;
    }

    private static String statusOf(String taskReason, Instant activeSince) {
        return taskReason != null ? CHANGE_NEEDED : activeSince == null ? NOT_SET : ACTIVE;
    }

    private static String sourceLabel(String source) {
        return switch (source) {
            case "RANDOM" -> "Random";
            case "IMPORT" -> "Import";
            default -> "Typed";
        };
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
