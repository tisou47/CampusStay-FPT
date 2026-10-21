package vn.fpt.campusstay.inv.internal;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.shared.export.ReportExport;

/** {@code GET /exports/inventory?termId&block}: every Bed of the Block(s), floor by floor, with its occupant. */
@Component
class InventoryExport implements ReportExport {

    private final InventoryService inventory;

    InventoryExport(InventoryService inventory) {
        this.inventory = inventory;
    }

    @Override
    public String report() {
        return "inventory";
    }

    @Override
    @Transactional(readOnly = true)
    public Table export(Map<String, String> f) {
        Long termId = ReportExport.longFilter(f, "termId");
        List<List<Object>> rows = new ArrayList<>();
        // The structure and floor views check the permission and the Block scope.
        for (InventoryService.BlockFloors block : inventory.structure(f.get("block")).blocks()) {
            for (int floor : block.floors()) {
                for (InventoryService.RoomView room : inventory.floor(termId, block.block(), floor).rooms()) {
                    for (InventoryService.BedView bed : room.beds()) {
                        rows.add(Arrays.asList(room.block(), room.floor(), room.code(), room.roomTypeName(),
                                room.roomClassName(), bed.id(), bed.state(),
                                bed.occupant() == null ? null : bed.occupant().name(),
                                bed.occupant() == null ? null : bed.occupant().studentCode(),
                                room.outOfService() == null ? null : room.outOfService().since(),
                                room.outOfService() == null ? null : room.outOfService().reason()));
                    }
                }
            }
        }
        String block = f.get("block");
        return new Table(block == null || block.isBlank() ? "inventory" : "inventory-block-" + block.trim(),
                List.of("Block", "Floor", "Room", "Room Type", "Room Class", "Bed", "State", "Occupant", "Student code",
                        "Out of service since", "Reason"),
                rows);
    }
}
