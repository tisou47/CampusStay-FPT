package vn.fpt.campusstay.ntf.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Pushes a notification to the user's active devices once the transaction
 * that created it has committed, on a virtual thread so the request does not
 * wait for FCM. Tokens FCM reports as invalid are disabled.
 */
@Component
class PushDispatcher implements DisposableBean {

    private record Device(long id, String token) {
    }

    private final JdbcClient jdbc;
    private final PushSender sender;
    private final Clock clock;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    PushDispatcher(JdbcClient jdbc, PushSender sender, Clock clock) {
        this.jdbc = jdbc;
        this.sender = sender;
        this.clock = clock;
    }

    void afterCommit(long userId, String title, String body, String link) {
        Runnable push = () -> executor.execute(() -> deliver(userId, title, body, link));
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            push.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                push.run();
            }
        });
    }

    void deliver(long userId, String title, String body, String link) {
        List<Device> devices = jdbc.sql("SELECT id, token FROM ntf_device WHERE user_id = :user AND disabled_at IS NULL")
                .param("user", userId).query((rs, i) -> new Device(rs.getLong("id"), rs.getString("token"))).list();
        for (Device device : devices) {
            if (sender.send(device.token(), title, body, link) == PushSender.Outcome.INVALID_TOKEN) {
                jdbc.sql("UPDATE ntf_device SET disabled_at = :now WHERE id = :id")
                        .param("now", Timestamp.from(Instant.now(clock))).param("id", device.id()).update();
            }
        }
    }

    @Override
    public void destroy() {
        executor.shutdown();
    }
}
