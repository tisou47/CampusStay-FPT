-- =====================================================================
-- CampusStay FPT — V59: damage per furniture item at check-out (Change
-- Specification v2 §6.16). The desk records what each damaged item of the
-- Room costs; the check-out's damage charge is their sum, and a damaged
-- item becomes Broken. Leavers past their Term's check-out date are listed
-- for Staff and shown to Managers (the dashboards read the allocations).
-- =====================================================================

CREATE TABLE asg_check_out_damage (
    check_out_id      BIGINT       NOT NULL REFERENCES asg_check_out (id) ON DELETE CASCADE,
    furniture_item_id BIGINT       NOT NULL REFERENCES inv_furniture_item (id),
    amount            BIGINT       NOT NULL CHECK (amount >= 0),
    note              VARCHAR(300),
    PRIMARY KEY (check_out_id, furniture_item_id)
);
