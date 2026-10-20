package vn.fpt.campusstay.auth.internal;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

import vn.fpt.campusstay.auth.Role;

/** Contract {@code user}: { id, name, email, role, studentCode?, title?, blocks? }. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserView(long id, String name, String email, Role role, String studentCode, String title,
        List<String> blocks) {
}
