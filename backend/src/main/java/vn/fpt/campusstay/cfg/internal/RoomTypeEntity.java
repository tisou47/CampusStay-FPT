package vn.fpt.campusstay.cfg.internal;

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

/** Room Type = number of Beds + base price per Bed for one Term (OI-04). */
@Entity
@Table(name = "cfg_room_type")
class RoomTypeEntity {

    enum Selection { AUTO, MUTUAL }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private int beds;

    @Column(name = "base_price", nullable = false)
    private long basePrice;

    @Enumerated(EnumType.STRING)
    @Column(name = "roommate_selection", nullable = false)
    private Selection roommateSelection;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActiveStatus status;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Version
    private long version;

    protected RoomTypeEntity() {
    }

    RoomTypeEntity(String name, int beds, long basePrice, Selection selection, ActiveStatus status, int sortOrder) {
        this.sortOrder = sortOrder;
        update(name, beds, basePrice, selection, status);
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    void update(String name, int beds, long basePrice, Selection selection, ActiveStatus status) {
        this.name = name;
        this.beds = beds;
        this.basePrice = basePrice;
        this.roommateSelection = selection;
        this.status = status;
    }

    Long getId() {
        return id;
    }

    String getName() {
        return name;
    }

    int getBeds() {
        return beds;
    }

    long getBasePrice() {
        return basePrice;
    }

    Selection getRoommateSelection() {
        return roommateSelection;
    }

    ActiveStatus getStatus() {
        return status;
    }
}
