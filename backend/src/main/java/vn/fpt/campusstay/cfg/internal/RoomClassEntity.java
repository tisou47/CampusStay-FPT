package vn.fpt.campusstay.cfg.internal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

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

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Room Class = amenity level with a surcharge on the Room Type price; set per Floor (OI-04). */
@Entity
@Table(name = "cfg_room_class")
class RoomClassEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(name = "surcharge_rate", nullable = false)
    private BigDecimal surchargeRate;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false)
    private String[] amenities;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActiveStatus status;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Version
    private long version;

    protected RoomClassEntity() {
    }

    RoomClassEntity(String name, BigDecimal surchargeRate, List<String> amenities, ActiveStatus status, int sortOrder) {
        this.sortOrder = sortOrder;
        update(name, surchargeRate, amenities, status);
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    void update(String name, BigDecimal surchargeRate, List<String> amenities, ActiveStatus status) {
        this.name = name;
        this.surchargeRate = surchargeRate;
        this.amenities = amenities.toArray(String[]::new);
        this.status = status;
    }

    Long getId() {
        return id;
    }

    String getName() {
        return name;
    }

    BigDecimal getSurchargeRate() {
        return surchargeRate;
    }

    List<String> getAmenities() {
        return amenities == null ? List.of() : List.of(amenities);
    }

    ActiveStatus getStatus() {
        return status;
    }
}
