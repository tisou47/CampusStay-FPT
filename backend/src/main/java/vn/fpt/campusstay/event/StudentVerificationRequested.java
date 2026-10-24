package vn.fpt.campusstay.event;

import java.util.List;

/**
 * A student who signed up with Google sent the sign-up form: the account waits for a Manager (spec §6.1, §10).
 *
 * @param managerIds the active Managers, who are told
 */
public record StudentVerificationRequested(long userId, String name, String studentCode, List<Long> managerIds) {
}
