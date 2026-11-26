package vn.fpt.campusstay.service.inventory;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps personal furniture linked to a Bed (V77), so that check-in inventories and check-out charges know whose item it
 * is. Called after anything that changes where an item is, its status or its type's use: an item that left its Room,
 * was disposed or whose type became shared loses its Bed; a personal item in a Room without one gets a Bed of that
 * Room that has no item of its type yet (by Bed label). A Room with more items of a type than Beds keeps the extra
 * ones unlinked (treated as shared).
 */
@Component
class FurnitureBeds {

    private final JdbcClient jdbc;

    FurnitureBeds(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** @param roomId the Room to link items in; null = every Room (after a type's use changed) */
    @Transactional(propagation = Propagation.MANDATORY)
    void relink(Long roomId) {
        jdbc.sql("""
                UPDATE inv_furniture_item i SET bed_id = NULL
                FROM inv_furniture_type t
                WHERE t.id = i.furniture_type_id AND i.bed_id IS NOT NULL
                  AND (t.use_scope <> 'PERSONAL' OR i.room_id IS NULL OR i.status = 'DISPOSED'
                       OR NOT EXISTS (SELECT 1 FROM inv_bed b WHERE b.id = i.bed_id AND b.room_id = i.room_id
                                                                  AND b.status <> 'RETIRED'))
                """).update();
        jdbc.sql("""
                WITH unlinked AS (
                    SELECT i.id, i.room_id, i.furniture_type_id,
                           row_number() OVER (PARTITION BY i.room_id, i.furniture_type_id ORDER BY i.id) AS n
                    FROM inv_furniture_item i JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                    WHERE t.use_scope = 'PERSONAL' AND i.bed_id IS NULL AND i.room_id IS NOT NULL
                      AND i.status <> 'DISPOSED' AND (CAST(:room AS BIGINT) IS NULL OR i.room_id = :room)
                ), open_beds AS (
                    SELECT b.id, b.room_id, t.id AS type_id,
                           row_number() OVER (PARTITION BY b.room_id, t.id ORDER BY b.label, b.id) AS n
                    FROM inv_bed b CROSS JOIN inv_furniture_type t
                    WHERE t.use_scope = 'PERSONAL' AND b.status <> 'RETIRED'
                      AND (CAST(:room AS BIGINT) IS NULL OR b.room_id = :room)
                      AND NOT EXISTS (SELECT 1 FROM inv_furniture_item x
                                      WHERE x.bed_id = b.id AND x.furniture_type_id = t.id AND x.status <> 'DISPOSED')
                )
                UPDATE inv_furniture_item f SET bed_id = open_beds.id
                FROM unlinked JOIN open_beds ON open_beds.room_id = unlinked.room_id
                                            AND open_beds.type_id = unlinked.furniture_type_id
                                            AND open_beds.n = unlinked.n
                WHERE f.id = unlinked.id
                """).param("room", roomId).update();
    }
}
