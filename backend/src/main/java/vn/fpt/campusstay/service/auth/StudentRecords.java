package vn.fpt.campusstay.service.auth;

import java.time.Instant;
import java.util.List;

/**
 * Port for the student hub (spec §11.3): each feature lists what it holds about one student, newest first.
 * Implemented by Applications (Applications), Assignment (Allocations), Billing (Invoices) and Requests
 * (Maintenance Requests, Room-Change Requests and swaps), so Auth reads none of their tables.
 */
public interface StudentRecords {

    /**
     * One line of a hub section.
     *
     * @param kind   {@code application}, {@code allocation}, {@code invoice}, {@code maintenance},
     *               {@code room-change} or {@code swap}: the web opens the matching screen
     * @param id     the record's code where it has one ({@code APP-SP27-000123}), else its id
     * @param status the contract label of the record's status
     * @param amount VND, for Invoices; null otherwise
     */
    record Item(String kind, String id, String title, String detail, String status, Long amount, Instant at) {
    }

    /** The hub section: {@code applications}, {@code allocations}, {@code invoices} or {@code requests}. */
    String section();

    /** At most {@code limit} records of the student, newest first. */
    List<Item> of(long studentId, int limit);
}
