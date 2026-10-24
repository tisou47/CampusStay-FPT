package vn.fpt.campusstay.service.auth;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import vn.fpt.campusstay.security.Role;

/**
 * Contract {@code user}: { id, name, email, role, studentCode?, title?, blocks?, locale }. IDs are strings
 * (ADR-15); {@code locale} is the account's language, {@code vi} or {@code en} (ADR-25).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserView(String id, String name, String email, Role role, String studentCode, String title,
        List<String> blocks, String locale) {
}
