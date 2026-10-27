package vn.fpt.campusstay.common.demo;

import java.time.Instant;
import java.time.LocalDate;

/**
 * One feature's part of the demo data (spec §15, ADR-27's demo reset tool). The Admin's reset clears every part
 * (highest {@link #order()} first) and loads them again (lowest first) in one transaction, so each feature writes
 * only its own tables. Parts read the plan the coordinator builds first ({@code db/demo/plan.sql}: the timeline in
 * {@code demo_t}, who lives and applies where in {@code demo_res} and {@code demo_app}).
 */
public interface DemoData {

    /**
     * The stage loaded and the moment it is loaded for: every date of the demo is relative to {@code now}.
     *
     * @param code  {@code A} (requests window and registration open), {@code B} (next-Term fees issued, before M7)
     *              or {@code C} (turnover week)
     * @param today the campus date of {@code now}
     */
    record Stage(String code, Instant now, LocalDate today) {
    }

    /** Load order: Settings 10, Inventory 20, Auth 30, Applications 40, Assignment 50, Billing 60, Maintenance 70, Requests 80, Notifications 90. */
    int order();

    /** Deletes the feature's business data (accounts, Buildings, furniture and configuration stay). */
    void clear();

    /** Writes the feature's part of the stage. */
    void load(Stage stage);
}
