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
import vn.fpt.campusstay.service.setting.ActiveStatus;

/** Room Type = number of Beds + base price per Bed for one Term (OI-04). */
@Entity
@Table(name = "cfg_room_type")
public class RoomTypeEntity {

    public enum Selection { AUTO, MUTUAL }

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

    public RoomTypeEntity(String name, int beds, long basePrice, Selection selection, ActiveStatus status, int sortOrder) {
        this.sortOrder = sortOrder;
        update(name, beds, basePrice, selection, status);
    }

    @PreUpdate
    public void touch() {
        updatedAt = Instant.now();
    }

    public void update(String name, int beds, long basePrice, Selection selection, ActiveStatus status) {
        this.name = name;
        this.beds = beds;
        this.basePrice = basePrice;
        this.roommateSelection = selection;
        this.status = status;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public int getBeds() {
        return beds;
    }

    public long getBasePrice() {
        return basePrice;
    }

    public Selection getRoommateSelection() {
        return roommateSelection;
    }

    public ActiveStatus getStatus() {
        return status;
    }
}
