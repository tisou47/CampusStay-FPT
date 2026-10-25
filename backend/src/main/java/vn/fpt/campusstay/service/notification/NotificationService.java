package vn.fpt.campusstay.service.notification;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.exception.ApiException;

/**
 * Notification Center of the signed-in user (every role). Users only ever see and change their own rows. A student's
 * bell also shows the announcements of their board (spec §6.5, C-41): their ids start with {@code ann-}.
 */
@Service
public class NotificationService {

    /** {@code kind}: {@code notification} or {@code announcement}. */
    public record Item(String id, String title, String body, Instant createdAt, String link, boolean read,
            String kind) {
    }

    /** Contract shape: the latest items and the number of unread ones (no {@code total}). */
    public record Inbox(List<Item> items, long unread) {
    }

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 100;

    private final JdbcClient jdbc;
    private final AnnouncementService announcements;
    private final Clock clock;

    public NotificationService(JdbcClient jdbc, AnnouncementService announcements, Clock clock) {
        this.jdbc = jdbc;
        this.announcements = announcements;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Inbox latest(long userId, boolean student, Integer limit) {
        int n = limit == null ? DEFAULT_LIMIT : limit;
        if (n < 1 || n > MAX_LIMIT) {
            throw ApiException.badRequest("BAD_PARAMETER", "Limit must be between 1 and " + MAX_LIMIT + ".");
        }
        // The reader's language (ADR-25); notifications written before V34 have only the English text.
        boolean vi = Locales.VI.equals(Locales.ofRequest());
        List<Item> items = jdbc.sql("""
                SELECT id, title, body, title_vi, body_vi, created_at, link, read_at IS NOT NULL AS read
                FROM ntf_notification WHERE user_id = :user
                ORDER BY created_at DESC, id DESC LIMIT :limit
                """)
                .param("user", userId)
                .param("limit", n)
                .query((rs, i) -> new Item(String.valueOf(rs.getLong("id")),
                        vi && rs.getString("title_vi") != null ? rs.getString("title_vi") : rs.getString("title"),
                        vi && rs.getString("body_vi") != null ? rs.getString("body_vi") : rs.getString("body"),
                        rs.getTimestamp("created_at").toInstant(), rs.getString("link"), rs.getBoolean("read"),
                        "notification"))
                .list();
        long unread = jdbc.sql("SELECT count(*) FROM ntf_notification WHERE user_id = :user AND read_at IS NULL")
                .param("user", userId).query(Long.class).single();
        if (!student) {
            return new Inbox(items, unread);
        }
        List<AnnouncementService.Item> board = announcements.visible(userId, Instant.now(clock));
        List<Item> merged = new ArrayList<>(items);
        board.forEach(a -> merged.add(new Item(a.id(), a.title(), a.body(), a.shownFrom().isAfter(a.createdAt())
                ? a.shownFrom() : a.createdAt(), a.link() == null ? "/student" : a.link(), a.read(), "announcement")));
        merged.sort(Comparator.comparing(Item::createdAt).reversed());
        return new Inbox(merged.stream().limit(n).toList(),
                unread + board.stream().filter(a -> !a.read()).count());
    }

    @Transactional
    public void markAllRead(long userId, boolean student) {
        if (student) {
            announcements.markAllRead(userId);
        }
        jdbc.sql("UPDATE ntf_notification SET read_at = :now WHERE user_id = :user AND read_at IS NULL")
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("user", userId)
                .update();
    }

    /** Someone else's notification answers 404, the same as one that does not exist; {@code ann-<id>}: an announcement. */
    @Transactional
    public void markRead(long userId, String id) {
        String value = id == null ? "" : id.trim();
        if (value.startsWith("ann-")) {
            announcements.markRead(userId, number(value.substring(4)));
            return;
        }
        long notificationId = number(value);
        int rows = jdbc.sql("""
                UPDATE ntf_notification SET read_at = COALESCE(read_at, :now) WHERE id = :id AND user_id = :user
                """)
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("id", notificationId)
                .param("user", userId)
                .update();
        if (rows == 0) {
            throw ApiException.notFound("This notification does not exist.");
        }
    }

    private static long number(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            throw ApiException.notFound("This notification does not exist.");
        }
    }
}
