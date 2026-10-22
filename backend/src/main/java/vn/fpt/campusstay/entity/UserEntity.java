package vn.fpt.campusstay.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import vn.fpt.campusstay.security.Role;

@Entity
@Table(name = "auth_user")
public class UserEntity {

    public enum Status { INVITED, ACTIVE, DISABLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "google_sub")
    private String googleSub;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "last_sign_in_at")
    private Instant lastSignInAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Version
    private long version;

    protected UserEntity() {
    }

    /** A back-office account invited by the Admin; it becomes Active when the password is set. */
    public UserEntity(String email, String displayName, Role role) {
        this.email = email;
        this.displayName = displayName;
        this.role = role;
        this.status = Status.INVITED;
    }

    @PreUpdate
    public void touch() {
        updatedAt = Instant.now();
    }

    public boolean isLockedAt(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    public void recordSignIn(Instant now) {
        failedAttempts = 0;
        lockedUntil = null;
        lastSignInAt = now;
        if (status == Status.INVITED) {
            status = Status.ACTIVE;
        }
    }

    public void changePassword(String newHash) {
        passwordHash = newHash;
        failedAttempts = 0;
        lockedUntil = null;
        if (status == Status.INVITED) {
            status = Status.ACTIVE;
        }
    }

    public void linkGoogle(String sub) {
        googleSub = sub;
    }

    public void rename(String newName) {
        displayName = newName;
    }

    public void changeRole(Role newRole) {
        role = newRole;
    }

    public void disable() {
        status = Status.DISABLED;
    }

    /** Re-enables a disabled account: Active if the user ever set a password or linked Google, else Invited. */
    public void restore() {
        status = passwordHash != null || googleSub != null ? Status.ACTIVE : Status.INVITED;
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getGoogleSub() {
        return googleSub;
    }

    public Role getRole() {
        return role;
    }

    public String getTitle() {
        return title;
    }

    public Status getStatus() {
        return status;
    }

    public Instant getLockedUntil() {
        return lockedUntil;
    }

    public Instant getLastSignInAt() {
        return lastSignInAt;
    }
}
