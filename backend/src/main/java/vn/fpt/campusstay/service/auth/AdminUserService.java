package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.entity.UserEntity;
import vn.fpt.campusstay.repository.UserRepository;

/**
 * Admin › Users and Roles: back-office accounts (Staff, Manager, Admin), their
 * Block scope and status. Students come from the student directory and are not
 * managed here. New accounts are invited: they set their password from the email link.
 */
@Service
public class AdminUserService {

    public static final String ALL_BLOCKS = "All Blocks";
    private static final String NO_BLOCK = "None";
    private static final List<Role> BACK_OFFICE = List.of(Role.STAFF, Role.MANAGER, Role.ADMIN);

    /** Contract item of {@code GET /admin/users}; role, scope and status are display labels. */
    public record UserItem(String id, String name, String email, String role, String scope, Instant lastSignInAt,
            String status) {
    }

    public record UserPage(List<UserItem> items, long total, List<String> roles, List<String> blocks,
            List<String> scopeOptions) {
    }

    /** Filters by label: role {@code Staff}, Block code {@code A}, status {@code Active}. */
    public record Filter(String q, String role, String block, String status) {
    }

    public record InviteCommand(String name, String email, String role, String scope) {
    }

    public record UpdateCommand(String name, String email, String role, String scope, String status) {
    }

    private final UserRepository users;
    private final JdbcClient jdbc;
    private final BlockDirectory blocks;
    private final PasswordService passwords;
    private final SessionService sessions;
    private final CurrentUser currentUser;
    private final AuditLog audit;
    private final StaffBlocks staffBlocks;

    public AdminUserService(UserRepository users, JdbcClient jdbc, BlockDirectory blocks, PasswordService passwords,
            SessionService sessions, CurrentUser currentUser, AuditLog audit, StaffBlocks staffBlocks) {
        this.users = users;
        this.jdbc = jdbc;
        this.blocks = blocks;
        this.passwords = passwords;
        this.sessions = sessions;
        this.currentUser = currentUser;
        this.audit = audit;
        this.staffBlocks = staffBlocks;
    }

    @Transactional(readOnly = true)
    public UserPage list(Filter filter, PageQuery page) {
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE u.role <> 'STUDENT'");
        if (hasText(filter.role())) {
            where.append(" AND u.role = :role");
            params.put("role", parseRole(filter.role()).orElseThrow(() -> badFilter("Choose a role from the list.")).name());
        }
        if (hasText(filter.status())) {
            where.append(" AND u.status = :status");
            params.put("status", parseStatus(filter.status()).orElseThrow(() -> badFilter("Choose a status from the list.")).name());
        }
        if (hasText(filter.block())) {
            long blockId = blocks.findIdByCode(filter.block().trim())
                    .orElseThrow(() -> badFilter("Block " + filter.block().trim() + " does not exist."));
            where.append(" AND (u.role = 'ADMIN' OR EXISTS (SELECT 1 FROM auth_user_block ub"
                    + " WHERE ub.user_id = u.id AND ub.building_id = :blockId))");
            params.put("blockId", blockId);
        }
        if (hasText(filter.q())) {
            where.append(" AND (u.display_name ILIKE :q OR u.email ILIKE :q)");
            params.put("q", "%" + escapeLike(filter.q().trim()) + "%");
        }
        long total = jdbc.sql("SELECT count(*) FROM auth_user u" + where).params(params).query(Long.class).single();
        List<Row> rows = jdbc.sql("""
                SELECT u.id, u.display_name, u.email, u.role, u.status, u.last_sign_in_at
                FROM auth_user u""" + where + " ORDER BY u.display_name, u.id LIMIT :limit OFFSET :offset")
                .params(params)
                .param("limit", page.limit())
                .param("offset", page.offset())
                .query((rs, i) -> {
                    Timestamp last = rs.getTimestamp("last_sign_in_at");
                    return new Row(rs.getLong("id"), rs.getString("display_name"), rs.getString("email"),
                            Role.valueOf(rs.getString("role")), UserEntity.Status.valueOf(rs.getString("status")),
                            last == null ? null : last.toInstant());
                })
                .list();

        Map<Long, List<String>> codesByUser = blockCodesByUser(rows.stream().map(Row::id).toList());
        List<String> activeCodes = List.copyOf(blocks.codesByIds(blocks.allActiveIds()).values());
        List<UserItem> items = rows.stream()
                .map(r -> new UserItem(String.valueOf(r.id()), r.name(), r.email(), roleLabel(r.role()),
                        scopeLabel(r.role(), codesByUser.getOrDefault(r.id(), List.of()), activeCodes), r.lastSignInAt(),
                        statusLabel(r.status())))
                .toList();
        return new UserPage(items, total, BACK_OFFICE.stream().map(AdminUserService::roleLabel).toList(), activeCodes,
                scopeOptions(activeCodes));
    }

    /** Creates an Invited account and emails the set-password link (72 hours). */
    @Transactional
    public long invite(InviteCommand command) {
        FieldErrors errors = new FieldErrors();
        Role role = parseRole(command.role()).orElse(null);
        errors.check(role != null, "role", "Choose Staff, Manager or Admin.");
        String email = command.email().trim().toLowerCase(Locale.ROOT);
        errors.check(users.findByEmailIgnoreCase(email).isEmpty(), "email", "An account with this email already exists.");
        Set<Long> blockIds = role != Role.STAFF ? Set.of() : parseScope(command.scope(), errors);
        errors.throwIfAny();

        UserEntity user = users.save(new UserEntity(email, command.name().trim(), role));
        replaceBlocks(user.getId(), blockIds);
        if (role == Role.STAFF) {
            ensureStaffProfile(user.getId());
        }
        passwords.sendInvitation(user.getId());
        audit.record("USER_INVITED", AuditLog.Tone.INFO, "User", user.getId(), email,
                Map.of("role", roleLabel(role), "scope", scopeLabel(role, codes(blockIds), activeCodes())));
        return user.getId();
    }

    @Transactional
    public UserItem update(long id, UpdateCommand command) {
        AuthenticatedUser me = currentUser.get();
        UserEntity user = users.findById(id).filter(u -> u.getRole() != Role.STUDENT)
                .orElseThrow(() -> ApiException.notFound("This user does not exist."));
        FieldErrors errors = new FieldErrors();
        if (hasText(command.email()) && !command.email().trim().equalsIgnoreCase(user.getEmail())) {
            errors.add("email", "The email cannot be changed. Invite a new user instead.");
        }
        Role role = parseRole(command.role()).orElse(null);
        errors.check(role != null, "role", "Choose Staff, Manager or Admin.");
        UserEntity.Status status = parseStatus(command.status()).orElse(null);
        errors.check(status != null, "status", "Choose Active, Invited or Disabled.");
        Set<Long> blockIds = role != Role.STAFF ? Set.of() : parseScope(command.scope(), errors);
        errors.throwIfAny();

        if (me.userId() == id && (role != Role.ADMIN || status == UserEntity.Status.DISABLED)) {
            throw ApiException.badRequest("OWN_ACCOUNT",
                    "You cannot remove your own Admin access or disable your own account.");
        }
        boolean losesAdmin = user.getRole() == Role.ADMIN && user.getStatus() == UserEntity.Status.ACTIVE
                && (role != Role.ADMIN || status == UserEntity.Status.DISABLED);
        if (losesAdmin && users.countByRoleAndStatusExcept(Role.ADMIN, UserEntity.Status.ACTIVE, id) == 0) {
            throw ApiException.conflict("LAST_ADMIN", "At least one active Admin must remain.");
        }

        List<String> activeCodes = activeCodes();
        Map<String, Object> change = new LinkedHashMap<>();
        String name = command.name().trim();
        if (!name.equals(user.getDisplayName())) {
            change.put("name", List.of(user.getDisplayName(), name));
            user.rename(name);
        }
        String oldScope = scopeLabel(user.getRole(), blockCodesByUser(List.of(id)).getOrDefault(id, List.of()),
                activeCodes);
        if (role != user.getRole()) {
            change.put("role", List.of(roleLabel(user.getRole()), roleLabel(role)));
            user.changeRole(role);
            if (role == Role.STAFF) {
                ensureStaffProfile(id);
            }
        }
        replaceBlocks(id, blockIds);
        String newScope = scopeLabel(role, codes(blockIds), activeCodes);
        if (!newScope.equals(oldScope)) {
            change.put("scope", List.of(oldScope, newScope));
        }
        UserEntity.Status before = user.getStatus();
        applyStatus(user, status);
        if (user.getStatus() != before) {
            change.put("status", List.of(statusLabel(before), statusLabel(user.getStatus())));
        }
        if (!change.isEmpty()) {
            audit.record(user.getStatus() == UserEntity.Status.DISABLED && before != UserEntity.Status.DISABLED
                    ? "USER_DISABLED" : "USER_UPDATED",
                    user.getStatus() == UserEntity.Status.DISABLED ? AuditLog.Tone.WARNING : AuditLog.Tone.INFO,
                    "User", id, user.getEmail(), change);
        }
        return new UserItem(String.valueOf(id), user.getDisplayName(), user.getEmail(), roleLabel(role), newScope,
                user.getLastSignInAt(), statusLabel(user.getStatus()));
    }

    /**
     * Disabled: signs the user out everywhere. Active/Invited from Disabled: restores the
     * account; one that never set a password gets a new invitation.
     */
    private void applyStatus(UserEntity user, UserEntity.Status target) {
        UserEntity.Status current = user.getStatus();
        if (target == current) {
            return;
        }
        if (target == UserEntity.Status.DISABLED) {
            user.disable();
            sessions.revokeAll(user.getId());
        } else if (current == UserEntity.Status.DISABLED) {
            user.restore();
            if (user.getStatus() == UserEntity.Status.INVITED) {
                passwords.sendInvitation(user.getId());
            }
        } else if (target == UserEntity.Status.ACTIVE) {
            throw ApiException.badRequest("INVITE_PENDING",
                    "This user has not accepted the invitation yet. The account becomes Active when they set a password.");
        } else {
            throw ApiException.badRequest("ALREADY_ACTIVE", "An active account cannot go back to Invited.");
        }
    }

    private Set<Long> parseScope(String scope, FieldErrors errors) {
        if (!hasText(scope) || scope.trim().equalsIgnoreCase(NO_BLOCK)) {
            errors.add("scope", "Choose the Blocks this user works in.");
            return Set.of();
        }
        if (scope.trim().equalsIgnoreCase(ALL_BLOCKS)) {
            Set<Long> all = blocks.allActiveIds();
            errors.check(!all.isEmpty(), "scope", "Create a Block first.");
            return all;
        }
        Set<Long> ids = new LinkedHashSet<>();
        for (String part : scope.split("[,+]")) {
            String code = part.trim().replaceFirst("(?i)^block\\s+", "");
            if (code.isEmpty()) {
                continue;
            }
            blocks.findIdByCode(code).ifPresentOrElse(ids::add,
                    () -> errors.add("scope", "Block " + code + " does not exist."));
        }
        errors.check(!ids.isEmpty() || errors.has("scope"), "scope", "Choose the Blocks this user works in.");
        return ids;
    }

    private void replaceBlocks(long userId, Set<Long> blockIds) {
        staffBlocks.replace(userId, blockIds);
    }

    private void ensureStaffProfile(long userId) {
        staffBlocks.ensureProfile(userId);
    }

    private Map<Long, List<String>> blockCodesByUser(Collection<Long> userIds) {
        return staffBlocks.codesByUser(userIds);
    }

    /** "All Blocks", every active Block, and the multi-Block scopes in use (so an edit form can show them). */
    private List<String> scopeOptions(List<String> activeCodes) {
        List<Long> scoped = jdbc.sql("""
                SELECT DISTINCT ub.user_id FROM auth_user_block ub JOIN auth_user u ON u.id = ub.user_id
                WHERE u.role = 'STAFF'
                """).query(Long.class).list();
        Set<String> combined = new TreeSet<>();
        for (List<String> codes : blockCodesByUser(scoped).values()) {
            String label = scopeLabel(Role.STAFF, codes, activeCodes);
            if (codes.size() > 1 && !ALL_BLOCKS.equals(label)) {
                combined.add(label);
            }
        }
        List<String> options = new ArrayList<>();
        options.add(ALL_BLOCKS);
        options.addAll(activeCodes);
        options.addAll(combined);
        return options;
    }

    private List<String> codes(Set<Long> blockIds) {
        return List.copyOf(blocks.codesByIds(blockIds).values());
    }

    private List<String> activeCodes() {
        return List.copyOf(blocks.codesByIds(blocks.allActiveIds()).values());
    }

    static String scopeLabel(Role role, List<String> codes, List<String> activeCodes) {
        if (role == Role.ADMIN || role == Role.MANAGER) { // Managers work for every Block (ADR-19)
            return ALL_BLOCKS;
        }
        if (codes.isEmpty()) {
            return NO_BLOCK;
        }
        if (codes.size() > 1 && codes.containsAll(activeCodes)) {
            return ALL_BLOCKS;
        }
        return String.join(", ", codes);
    }

    static String roleLabel(Role role) {
        return switch (role) {
            case STUDENT -> "Student";
            case STAFF -> "Staff";
            case MANAGER -> "Manager";
            case ADMIN -> "Admin";
        };
    }

    static String statusLabel(UserEntity.Status status) {
        return switch (status) {
            case ACTIVE -> "Active";
            case INVITED -> "Invited";
            case DISABLED -> "Disabled";
        };
    }

    private static Optional<Role> parseRole(String label) {
        if (!hasText(label)) {
            return Optional.empty();
        }
        return BACK_OFFICE.stream().filter(r -> r.name().equalsIgnoreCase(label.trim())).findFirst();
    }

    private static Optional<UserEntity.Status> parseStatus(String label) {
        if (!hasText(label)) {
            return Optional.empty();
        }
        for (UserEntity.Status s : UserEntity.Status.values()) {
            if (s.name().equalsIgnoreCase(label.trim())) {
                return Optional.of(s);
            }
        }
        return Optional.empty();
    }

    private static ApiException badFilter(String message) {
        return ApiException.badRequest("BAD_PARAMETER", message);
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private record Row(long id, String name, String email, Role role, UserEntity.Status status, Instant lastSignInAt) {
    }
}
