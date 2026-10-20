package vn.fpt.campusstay.cfg.internal;

import java.time.Instant;
import java.time.LocalDate;

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

/** A Term with its registration, payment and check-in windows (Admin › Terms and Windows). */
@Entity
@Table(name = "cfg_term")
class TermEntity {

    enum Status { DRAFT, PUBLISHED, CLOSED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Column(name = "stay_start", nullable = false)
    private LocalDate stayStart;

    @Column(name = "stay_end", nullable = false)
    private LocalDate stayEnd;

    @Column(name = "registration_opens_at", nullable = false)
    private Instant registrationOpensAt;

    @Column(name = "registration_closes_at", nullable = false)
    private Instant registrationClosesAt;

    @Column(name = "results_published_at", nullable = false)
    private Instant resultsPublishedAt;

    @Column(name = "roommate_hours", nullable = false)
    private int roommateHours;

    @Column(name = "deposit_hours", nullable = false)
    private int depositHours;

    @Column(name = "balance_due_at", nullable = false)
    private Instant balanceDueAt;

    @Column(name = "check_in_start", nullable = false)
    private LocalDate checkInStart;

    @Column(name = "check_in_end", nullable = false)
    private LocalDate checkInEnd;

    @Column(name = "check_out_by", nullable = false)
    private LocalDate checkOutBy;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Version
    private long version;

    protected TermEntity() {
    }

    TermEntity(String code, AdminTermService.TermValues values, int depositHours) {
        this.code = code;
        this.status = Status.DRAFT;
        apply(values, depositHours);
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    void apply(AdminTermService.TermValues v, int depositHours) {
        name = v.name().trim();
        stayStart = v.stayStart();
        stayEnd = v.stayEnd();
        registrationOpensAt = v.registrationOpensAt();
        registrationClosesAt = v.registrationClosesAt();
        resultsPublishedAt = v.resultsPublishedAt();
        roommateHours = v.roommateHours();
        this.depositHours = depositHours;
        balanceDueAt = v.balanceDueAt();
        checkInStart = v.checkInStart();
        checkInEnd = v.checkInEnd();
        checkOutBy = v.checkOutBy();
    }

    void publish(Instant now) {
        status = Status.PUBLISHED;
        publishedAt = now;
    }

    AdminTermService.TermValues values() {
        return new AdminTermService.TermValues(name, stayStart, stayEnd, registrationOpensAt, registrationClosesAt,
                resultsPublishedAt, roommateHours, depositHours, balanceDueAt, checkInStart, checkInEnd, checkOutBy);
    }

    Long getId() {
        return id;
    }

    String getName() {
        return name;
    }

    Status getStatus() {
        return status;
    }

    LocalDate getStayStart() {
        return stayStart;
    }

    LocalDate getStayEnd() {
        return stayEnd;
    }

    Instant getRegistrationOpensAt() {
        return registrationOpensAt;
    }

    Instant getRegistrationClosesAt() {
        return registrationClosesAt;
    }
}
