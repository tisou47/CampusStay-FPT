package vn.fpt.campusstay.entity;

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
import vn.fpt.campusstay.service.setting.AdminTermService;

/**
 * A Term with its registration, payment and check-in windows (Admin › Terms). A Draft saved by the wizard may still
 * miss its windows (V42); the wizard writes its other columns through SQL ({@code TermWizardService}).
 */
@Entity
@Table(name = "cfg_term")
public class TermEntity {

    public enum Status { DRAFT, PUBLISHED, CLOSED }

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

    @Column(name = "registration_opens_at")
    private Instant registrationOpensAt;

    @Column(name = "registration_closes_at")
    private Instant registrationClosesAt;

    @Column(name = "results_published_at")
    private Instant resultsPublishedAt;

    @Column(name = "roommate_hours")
    private Integer roommateHours;

    @Column(name = "deposit_hours")
    private Integer depositHours;

    @Column(name = "balance_due_at")
    private Instant balanceDueAt;

    @Column(name = "check_in_start")
    private LocalDate checkInStart;

    @Column(name = "check_in_end")
    private LocalDate checkInEnd;

    @Column(name = "check_out_by")
    private LocalDate checkOutBy;

    @Column(name = "published_at")
    private Instant publishedAt;

    /** Last wizard step saved; Terms of the form are complete (database default 7). */
    @Column(name = "wizard_step", insertable = false, updatable = false)
    private Integer wizardStep;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Version
    private long version;

    protected TermEntity() {
    }

    public TermEntity(String code, AdminTermService.TermValues values, int depositHours) {
        this.code = code;
        this.status = Status.DRAFT;
        apply(values, depositHours);
    }

    @PreUpdate
    public void touch() {
        updatedAt = Instant.now();
    }

    public void apply(AdminTermService.TermValues v, int depositHours) {
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

    public AdminTermService.TermValues values() {
        return new AdminTermService.TermValues(name, stayStart, stayEnd, registrationOpensAt, registrationClosesAt,
                resultsPublishedAt, roommateHours, depositHours, balanceDueAt, checkInStart, checkInEnd, checkOutBy);
    }

    public Integer getWizardStep() {
        return wizardStep;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Status getStatus() {
        return status;
    }

    public LocalDate getStayStart() {
        return stayStart;
    }

    public LocalDate getStayEnd() {
        return stayEnd;
    }

    public Instant getRegistrationOpensAt() {
        return registrationOpensAt;
    }

    public Instant getRegistrationClosesAt() {
        return registrationClosesAt;
    }
}
