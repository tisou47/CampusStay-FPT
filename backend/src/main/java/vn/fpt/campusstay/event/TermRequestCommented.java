package vn.fpt.campusstay.event;

import java.util.List;

/**
 * Someone commented on a registration-period request (D-11).
 *
 * @param adminIds   the Admins, without the author
 * @param managerIds the requesting Manager and the Managers who commented, without the author
 */
public record TermRequestCommented(long requestId, String code, String termName, String authorName, String comment,
        List<Long> adminIds, List<Long> managerIds) {
}
