package vn.fpt.campusstay.controller.auth;

import java.util.Arrays;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonProperty;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.AdminUserService;
import vn.fpt.campusstay.service.auth.AuditTrailService;
import vn.fpt.campusstay.dto.PageQuery;

/** Admin › Users and Roles, the permission matrix and the Audit Log ({@code /admin/**} is Admin only). */
@RestController
@RequestMapping("/admin")
class AdminUserController {

    record InviteRequest(
            @NotBlank(message = "Enter the full name.") @Size(max = 150, message = "Use at most 150 characters.") String name,
            @NotBlank(message = "Enter the email.") @Email(message = "Enter a valid email.") @Size(max = 254) String email,
            @NotBlank(message = "Choose a role.") String role,
            @Size(max = 200) String scope) {
    }

    record UpdateRequest(
            @NotBlank(message = "Enter the full name.") @Size(max = 150, message = "Use at most 150 characters.") String name,
            @Size(max = 254) String email,
            @NotBlank(message = "Choose a role.") String role,
            @Size(max = 200) String scope,
            @NotBlank(message = "Choose a status.") String status) {
    }

    record Created(String id) {
    }

    record RoleColumn(String key, @JsonProperty("short") String shortName) {
    }

    record PermissionRow(String action, List<Boolean> allowed) {
    }

    record PermissionMatrix(List<RoleColumn> roles, List<PermissionRow> rows) {
    }

    private static final List<Role> MATRIX_ROLES = List.of(Role.STUDENT, Role.STAFF, Role.MANAGER, Role.ADMIN);

    private final AdminUserService users;
    private final AuditTrailService auditTrail;

    AdminUserController(AdminUserService users, AuditTrailService auditTrail) {
        this.users = users;
        this.auditTrail = auditTrail;
    }

    @GetMapping("/users")
    AdminUserService.UserPage list(@RequestParam(required = false) String q, @RequestParam(required = false) String role,
            @RequestParam(required = false) String block, @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return users.list(new AdminUserService.Filter(q, role, block, status), PageQuery.of(page, pageSize));
    }

    @PostMapping("/users")
    Created invite(@Valid @RequestBody InviteRequest body) {
        long id = users.invite(new AdminUserService.InviteCommand(body.name(), body.email(), body.role(), body.scope()));
        return new Created(String.valueOf(id));
    }

    @PutMapping("/users/{id}")
    AdminUserService.UserItem update(@PathVariable long id, @Valid @RequestBody UpdateRequest body) {
        return users.update(id, new AdminUserService.UpdateCommand(body.name(), body.email(), body.role(), body.scope(),
                body.status()));
    }

    /** Built from {@link Permission}, the rule table the services enforce. */
    @GetMapping("/permissions")
    PermissionMatrix permissions() {
        List<RoleColumn> roles = MATRIX_ROLES.stream()
                .map(r -> new RoleColumn(r.json(), switch (r) {
                    case STUDENT -> "Stu";
                    case STAFF -> "Stf";
                    case MANAGER -> "Mgr";
                    case ADMIN -> "Adm";
                }))
                .toList();
        List<PermissionRow> rows = Arrays.stream(Permission.values())
                .map(p -> new PermissionRow(p.action(), MATRIX_ROLES.stream().map(p::allows).toList()))
                .toList();
        return new PermissionMatrix(roles, rows);
    }

    @GetMapping("/audit-log")
    AuditTrailService.AuditPage auditLog(@RequestParam(required = false) String q,
            @RequestParam(required = false) String actor, @RequestParam(required = false) String action,
            @RequestParam(required = false) String role, @RequestParam(required = false) String range,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return auditTrail.list(q, actor, action, role, range, PageQuery.of(page, pageSize));
    }
}
