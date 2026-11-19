-- =====================================================================
-- CampusStay FPT — V89: the physical condition an item is in now, next to
-- its lifecycle status. Inspections, final check-in inventories and
-- check-outs update it (Good, Worn, Damaged, Missing: the four handover
-- levels mapped to Admin › Furniture types' condition levels); a resolved
-- repair or a Manager putting a Broken / In repair item back in use resets
-- it to Good. The snapshots of the handovers, check-outs and inspections
-- are left as they are: existing items start as Good, or Damaged when they
-- are Broken or In repair today.
-- =====================================================================

ALTER TABLE inv_furniture_item
    ADD COLUMN condition VARCHAR(10) NOT NULL DEFAULT 'GOOD'
        CHECK (condition IN ('GOOD', 'WORN', 'DAMAGED', 'MISSING'));

UPDATE inv_furniture_item SET condition = 'DAMAGED' WHERE status IN ('BROKEN', 'IN_REPAIR');
