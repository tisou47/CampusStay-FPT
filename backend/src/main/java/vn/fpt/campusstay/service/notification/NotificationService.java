package vn.fpt.campusstay.service.notification;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.exception.ApiException;

/** Notification Center of the signed-in user (every role). Users only ever see and change their own rows. */
@Service
public class NotificationService {

    public record Item(String id, String title, String body, Instant createdAt, String link, boolean read) {
    }

    /** Contract shape: the latest items and the number of unread ones (no {@code total}). */
    public record Inbox(List<Item> items, long unread) {
    }

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 100;

    private final JdbcClient jdbc;
    private final Clock clock;

    public NotificationService(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Inbox latest(long userId, Integer limit) {
        int n = limit == null ? DEFAULT_LIMIT : limit;
        if (n < 1 || n > MAX_LIMIT) {
            throw ApiException.badRequest("BAD_PARAMETER", "Limit must be between 1 and " + MAX_LIMIT + ".");
        }
        List<Item> items = jdbc.sql("""
                SELECT id, title, body, created_at, link, read_at IS NOT NULL AS read
                FROM ntf_notification WHERE user_id = :user
                ORDER BY created_at DESC, id DESC LIMIT :limit
                """)
                .param("user", userId)
                .param("limit", n)
                .query((rs, i) -> new Item(String.valueOf(rs.getLong("id")), rs.getString("title"), rs.getString("body"),
                        rs.getTimestamp("created_at").toInstant(), rs.getString("link"), rs.getBoolean("read")))
                .list();
        long unread = jdbc.sql("SELECT count(*) FROM ntf_notification WHERE user_id = :user AND read_at IS NULL")
                .param("user", userId).query(Long.class).single();
        return new Inbox(items, unread);
    }

    @Transactional
    public void markAllRead(long userId) {
        jdbc.sql("UPDATE ntf_notification SET read_at = :now WHERE user_id = :user AND read_at IS NULL")
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("user", userId)
                .update();
    }

    /** Someone else's notification answers 404, the same as one that does not exist. */
    @Transactional
    public void markRead(long userId, long notificationId) {
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
}
