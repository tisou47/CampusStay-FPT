package vn.fpt.campusstay.service.inventory;

import java.time.Instant;
import java.util.List;

/**
 * Port for the Room hub (spec §11.3): each feature lists what it holds about one Room, newest first. Implemented by
 * Assignment (residents of the current and the next Term), Billing (meter readings) and Maintenance (Maintenance
 * Requests, inspections), so Inventory reads none of their tables.
 */
public interface RoomRecords {

    /**
     * One line of a hub section.
     *
     * @param kind   {@code student}, {@code meter-reading}, {@code maintenance} or {@code inspection}: the web opens
     *               the matching screen
     * @param id     the student's id, the request's code ({@code MR-000321}) or the record's id
     * @param status the contract label of the record's status
     */
    record Item(String kind, String id, String title, String detail, String status, Instant at) {
    }

    /** The hub section: {@code residents}, {@code meterReadings}, {@code maintenance} or {@code inspections}. */
    String section();

    /** At most {@code limit} records of the Room, newest first (residents: by Term, then Bed). */
    List<Item> of(long roomId, int limit);
}
