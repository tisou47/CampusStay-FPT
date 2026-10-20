package vn.fpt.campusstay.shared.audit;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.shared.web.RequestInfo;

/**
 * Append-only Audit Log (Admin › Audit Log). Call it inside the business
 * transaction so the entry commits or rolls back with the change it describes.
 * Use {@link #recordIndependently} for events that must survive a rollback
 * (failed sign-ins, refused webhooks).
 */
@Service
public class AuditLog {

    public enum Tone { INFO, SUCCESS, WARNING, DANGER }

    private final JdbcClient jdbc;
    private final ActorResolver actorResolver;
    private final JsonMapper json;
    private final Clock clock;

    public AuditLog(JdbcClient jdbc, ActorResolver actorResolver, JsonMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.actorResolver = actorResolver;
        this.json = json;
        this.clock = clock;
    }

    /** Records an action by the current actor. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(String action, Tone tone, String objectType, Object objectId, String objectLabel,
            Map<String, ?> change) {
        insert(actorResolver.currentActor(), action, tone, objectType, objectId, objectLabel, change);
    }

    /** Records an action by an explicit actor (e.g. the user who is signing in). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(Actor actor, String action, Tone tone, String objectType, Object objectId, String objectLabel,
            Map<String, ?> change) {
        insert(actor, action, tone, objectType, objectId, objectLabel, change);
    }

    /** Records in its own transaction, so the entry stays even if the caller rolls back. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordIndependently(Actor actor, String action, Tone tone, String objectType, Object objectId,
            String objectLabel, Map<String, ?> change) {
        insert(actor, action, tone, objectType, objectId, objectLabel, change);
    }

    private void insert(Actor actor, String action, Tone tone, String objectType, Object objectId, String objectLabel,
            Map<String, ?> change) {
        jdbc.sql("""
                INSERT INTO shared_audit_log (at, actor_id, actor_label, action, tone, object_type, object_id,
                                              object_label, change, ip_address)
                VALUES (:at, :actorId, :actorLabel, :action, :tone, :objectType, :objectId,
                        :objectLabel, CAST(:change AS jsonb), :ip)
                """)
                .param("at", java.sql.Timestamp.from(Instant.now(clock)))
                .param("actorId", actor.id())
                .param("actorLabel", actor.label())
                .param("action", action)
                .param("tone", tone.name())
                .param("objectType", objectType)
                .param("objectId", objectId == null ? null : String.valueOf(objectId))
                .param("objectLabel", objectLabel)
                .param("change", change == null || change.isEmpty() ? null : json.writeValueAsString(change))
                .param("ip", RequestInfo.ip())
                .update();
    }
}
