package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.AuthProperties;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.entity.UserEntity;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.repository.UserRepository;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;

/**
 * Manager › Staff accounts (spec §3, §11.2): Managers create the Staff accounts of the dormitory, choose the Blocks
 * each one works in, and disable or restore them. A new account is invited by email and becomes Active when its
 * owner sets a password. Managers and Admins are managed by the Admin (Admin › Users and roles).
 */
@Service
public class StaffAccountService {

    /** {@code status} Active, Invited or Disabled; {@code blocks} Block codes. */
    public record Item(String id, String name, String email, String title, List<String> blocks, String status,
            Instant lastSignInAt) {
    }

    public record Page(List<Item> items, long total, List<String> blocks, List<String> statuses) {
    }

    public record Created(String id) {
    }

    public record Create(String name, String email, String title, List<String> blocks) {
    }

    /** Fields left null are kept. */
    public record Update(String name, String title, List<String> blocks, String status) {
    }

    private static final List<String> STATUSES = List.of("Active", "Invited", "Disabled");

    private final JdbcClient jdbc;
    private final UserRepository users;
    private final BlockDirectory blocks;
    private final StaffBlocks staffBlocks;
    private final PasswordService passwords;
    private final SessionService sessions;
    private final CurrentUser currentUser;
    private final AuthProperties properties;
    private final AuditLog audit;

    StaffAccountService(JdbcClient jdbc, UserRepository users, BlockDirectory blocks, StaffBlocks staffBlocks,
            PasswordService passwords, SessionService sessions, CurrentUser currentUser, AuthProperties properties,
            AuditLog audit) {
        this.jdbc = jdbc;
        this.users = users;
        this.blocks = blocks;
        this.staffBlocks = staffBlocks;
        this.passwords = passwords;
        this.sessions = sessions;
        this.currentUser = currentUser;
        this.properties = properties;
        this.audit = audit;
    }

    /** @param block a Block code; {@code status} Active, Invited or Disabled */
    @Transactional(readOnly = true)
    public Page list(String q, String block, String status, PageQuery page) {
        currentUser.require(Permission.MANAGE_STAFF_ACCOUNTS);
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE u.role = 'STAFF'");
        if (hasText(block)) {
            long id = blocks.findIdByCode(block.trim())
                    .orElseThrow(() -> ApiException.badRequest("BAD_PARAMETER", "Block " + block.trim() + " does not exist."));
            where.append(" AND EXISTS (SELECT 1 FROM auth_user_block b WHERE b.user_id = u.id AND b.building_id = :block)");
            params.put("block", id);
        }
        if (hasText(status)) {
            where.append(" AND u.status = :status");
            params.put("status", parseStatus(status)
                    .orElseThrow(() -> ApiException.badRequest("BAD_PARAMETER", "Choose a status from the list.")).name());
        }
        if (hasText(q)) {
            where.append(" AND (u.display_name ILIKE :q OR u.email ILIKE :q OR u.title ILIKE :q)");
            params.put("q", "%" + q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        long total = jdbc.sql("SELECT count(*) FROM auth_user u" + where).params(params).query(Long.class).single();
        record Row(long id, String name, String email, String title, String status, Instant last) {
        }
        List<Row> rows = jdbc.sql("SELECT u.id, u.display_name, u.email, u.title, u.status, u.last_sign_in_at"
                + " FROM auth_user u" + where + " ORDER BY u.display_name, u.id LIMIT :limit OFFSET :offset")
                .params(params).param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> {
                    Timestamp last = rs.getTimestamp("last_sign_in_at");
                    return new Row(rs.getLong("id"), rs.getString("display_name"), rs.getString("email"),
                            rs.getString("title"), rs.getString("status"), last == null ? null : last.toInstant());
                })
                .list();
        Map<Long, List<String>> codes = staffBlocks.codesByUser(rows.stream().map(Row::id).toList());
        List<Item> items = rows.stream()
                .map(r -> new Item(String.valueOf(r.id()), r.name(), r.email(), r.title(),
                        codes.getOrDefault(r.id(), List.of()),
                        AdminUserService.statusLabel(UserEntity.Status.valueOf(r.status())), r.last()))
                .toList();
        return new Page(items, total, List.copyOf(blocks.codesByIds(blocks.allActiveIds()).values()), STATUSES);
    }

    /** Creates an Invited Staff account in the chosen Blocks and emails the set-password link (72 hours). */
    @Transactional
    public Created create(Create command) {
        currentUser.require(Permission.MANAGE_STAFF_ACCOUNTS);
        FieldErrors errors = new FieldErrors();
        String name = command.name() == null ? "" : command.name().strip();
        errors.check(!name.isEmpty() && name.length() <= 150, "name", "Enter the full name (at most 150 characters).");
        String email = command.email() == null ? "" : command.email().strip().toLowerCase(Locale.ROOT);
        String domain = properties.google() == null ? null : properties.google().hostedDomain();
        errors.check(email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+") && email.length() <= 254, "email", "Enter a valid email.");
        if (!errors.has("email") && domain != null && !domain.isBlank()) {
            errors.check(email.endsWith("@" + domain.toLowerCase(Locale.ROOT)), "email", "Use an @" + domain + " email.");
        }
        if (!errors.has("email")) {
            errors.check(users.findByEmailIgnoreCase(email).isEmpty(), "email", "An account with this email already exists.");
        }
        String title = title(command.title(), errors);
        Set<Long> blockIds = blockIds(command.blocks(), errors);
        errors.throwIfAny();

        long id = jdbc.sql("""
                INSERT INTO auth_user (email, display_name, role, title, status) VALUES (:email, :name, 'STAFF', :title, 'INVITED')
                RETURNING id
                """).param("email", email).param("name", name).param("title", title).query(Long.class).single();
        staffBlocks.replace(id, blockIds);
        staffBlocks.ensureProfile(id);
        passwords.sendInvitation(id);
        audit.record("USER_INVITED", AuditLog.Tone.INFO, "User", id, email,
                Map.of("role", "Staff", "scope", String.join(", ", codes(blockIds))));
        return new Created(String.valueOf(id));
    }

    @Transactional
    public Item update(String id, Update command) {
        currentUser.require(Permission.MANAGE_STAFF_ACCOUNTS);
        UserEntity user = staff(id);
        FieldErrors errors = new FieldErrors();
        String name = command.name() == null ? user.getDisplayName() : command.name().strip();
        errors.check(!name.isEmpty() && name.length() <= 150, "name", "Enter the full name (at most 150 characters).");
        String title = command.title() == null ? user.getTitle() : title(command.title(), errors);
        Set<Long> blockIds = command.blocks() == null ? null : blockIds(command.blocks(), errors);
        UserEntity.Status status = command.status() == null ? user.getStatus() : parseStatus(command.status()).orElse(null);
        errors.check(status != null, "status", "Choose Active, Invited or Disabled.");
        errors.throwIfAny();

        Map<String, Object> change = new LinkedHashMap<>();
        if (!name.equals(user.getDisplayName())) {
            change.put("name", List.of(user.getDisplayName(), name));
            user.rename(name);
        }
        if (!Objects.equals(title, user.getTitle())) {
            change.put("title", Arrays.asList(user.getTitle(), title));
            user.retitle(title);
        }
        List<String> before = staffBlocks.codesByUser(List.of(user.getId())).getOrDefault(user.getId(), List.of());
        if (blockIds != null) {
            List<String> after = codes(blockIds);
            if (!after.equals(before)) {
                change.put("scope", List.of(String.join(", ", before), String.join(", ", after)));
                staffBlocks.replace(user.getId(), blockIds);
            }
        }
        UserEntity.Status was = user.getStatus();
        if (status != was) {
            if (status == UserEntity.Status.DISABLED) {
                user.disable();
                sessions.revokeAll(user.getId());
            } else if (was == UserEntity.Status.DISABLED) {
                user.restore();
                if (user.getStatus() == UserEntity.Status.INVITED) {
                    passwords.sendInvitation(user.getId());
                }
            } else if (status == UserEntity.Status.ACTIVE) {
                throw ApiException.badRequest("INVITE_PENDING",
                        "This user has not accepted the invitation yet. The account becomes Active when they set a password.");
            } else {
                throw ApiException.badRequest("ALREADY_ACTIVE", "An active account cannot go back to Invited.");
            }
            change.put("status", List.of(AdminUserService.statusLabel(was), AdminUserService.statusLabel(user.getStatus())));
        }
        if (!change.isEmpty()) {
            boolean disabled = user.getStatus() == UserEntity.Status.DISABLED && was != UserEntity.Status.DISABLED;
            audit.record(disabled ? "USER_DISABLED" : "USER_UPDATED", disabled ? AuditLog.Tone.WARNING : AuditLog.Tone.INFO,
                    "User", user.getId(), user.getEmail(), change);
        }
        return new Item(String.valueOf(user.getId()), user.getDisplayName(), user.getEmail(), user.getTitle(),
                blockIds == null ? before : codes(blockIds), AdminUserService.statusLabel(user.getStatus()),
                user.getLastSignInAt());
    }

    /** Sends a new set-password link to a Staff member who has not set a password yet. */
    @Transactional
    public void resendInvitation(String id) {
        currentUser.require(Permission.MANAGE_STAFF_ACCOUNTS);
        UserEntity user = staff(id);
        if (user.getStatus() != UserEntity.Status.INVITED) {
            throw ApiException.conflict("NOT_INVITED", user.getStatus() == UserEntity.Status.DISABLED
                    ? "This account is disabled. Restore it first."
                    : "This person has already set a password.");
        }
        passwords.sendInvitation(user.getId());
        audit.record("INVITATION_SENT", AuditLog.Tone.INFO, "User", user.getId(), user.getEmail(), null);
    }

    /** A Staff account by id; any other account answers 404. */
    private UserEntity staff(String id) {
        if (id == null || id.isBlank() || id.length() > 18 || !id.chars().allMatch(Character::isDigit)) {
            throw ApiException.notFound("This staff member does not exist.");
        }
        return users.findById(Long.parseLong(id)).filter(u -> u.getRole() == Role.STAFF)
                .orElseThrow(() -> ApiException.notFound("This staff member does not exist."));
    }

    private static String title(String value, FieldErrors errors) {
        String title = value == null ? "" : value.strip();
        errors.check(title.length() <= 100, "title", "Use at most 100 characters.");
        return title.isEmpty() ? null : title;
    }

    private Set<Long> blockIds(List<String> codes, FieldErrors errors) {
        Set<Long> ids = new LinkedHashSet<>();
        for (String code : codes == null ? List.<String>of() : codes) {
            if (code == null || code.isBlank()) {
                continue;
            }
            String c = code.trim().replaceFirst("(?i)^block\\s+", "");
            blocks.findIdByCode(c).ifPresentOrElse(ids::add, () -> errors.add("blocks", "Block " + c + " does not exist."));
        }
        errors.check(!ids.isEmpty() || errors.has("blocks"), "blocks", "Choose the Blocks this person works in.");
        return ids;
    }

    private List<String> codes(Set<Long> blockIds) {
        return new ArrayList<>(blocks.codesByIds(blockIds).values());
    }

    private static Optional<UserEntity.Status> parseStatus(String label) {
        for (UserEntity.Status s : UserEntity.Status.values()) {
            if (s.name().equalsIgnoreCase(label.trim())) {
                return Optional.of(s);
            }
        }
        return Optional.empty();
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
