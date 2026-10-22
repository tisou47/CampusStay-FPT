package vn.fpt.campusstay.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "auth_session")
public class SessionEntity {

    public enum Method { PASSWORD, GOOGLE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;

    @Column(name = "user_id", nullable = false, updatable = false)
    private long userId;

    @Column(nullable = false, updatable = false)
    private boolean remember;

    @Enumerated(EnumType.STRING)
    @Column(name = "sign_in_method", nullable = false, updatable = false)
    private Method signInMethod;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "user_agent", updatable = false)
    private String userAgent;

    @Column(name = "ip_address", updatable = false)
    private String ipAddress;

    protected SessionEntity() {
    }

    public SessionEntity(String tokenHash, long userId, boolean remember, Method method, Instant now, Instant expiresAt,
            String userAgent, String ipAddress) {
        this.tokenHash = tokenHash;
        this.userId = userId;
        this.remember = remember;
        this.signInMethod = method;
        this.createdAt = now;
        this.lastUsedAt = now;
        this.expiresAt = expiresAt;
        this.userAgent = userAgent;
        this.ipAddress = ipAddress;
    }

    public Long getId() {
        return id;
    }
}
