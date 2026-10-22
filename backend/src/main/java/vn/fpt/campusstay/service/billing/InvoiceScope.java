package vn.fpt.campusstay.service.billing;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.inventory.Buildings;
import vn.fpt.campusstay.repository.billing.InvoiceStore;

/**
 * Block scope for Invoices. An Invoice issued after the student holds a Bed
 * carries its Block; a Deposit (no Bed yet) belongs to the Blocks of the
 * student's gender, like its Application.
 */
@Component
class InvoiceScope {

    /** @param buildings Blocks in scope; {@code genders} their genders, for Invoices without a Block */
    record Scope(Set<Long> buildings, Set<String> genders) {

        /** SQL condition on {@code bil_invoice} columns; bind with {@link #params()}. */
        String where(String alias) {
            String p = alias.isEmpty() ? "" : alias + ".";
            return "(" + p + "building_id IN (:scopeBuildings) OR (" + p + "building_id IS NULL AND " + p
                    + "gender IN (:scopeGenders)))";
        }

        Map<String, Object> params() {
            return Map.of("scopeBuildings", List.copyOf(buildings), "scopeGenders",
                    genders.isEmpty() ? List.of("-") : List.copyOf(genders));
        }

        boolean contains(InvoiceStore.Invoice invoice) {
            return invoice.buildingId() != null ? buildings.contains(invoice.buildingId())
                    : genders.contains(invoice.gender());
        }
    }

    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final Buildings buildings;

    InvoiceScope(CurrentUser currentUser, BlockScope blockScope, Buildings buildings) {
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.buildings = buildings;
    }

    /** Staff, Manager or Admin: the Blocks of the {@code block} parameter (blank = all in scope). */
    Scope resolve(String block) {
        Set<Long> ids = blockScope.resolve(block).ids();
        return new Scope(ids, buildings.gendersOf(ids));
    }

    /** Whether the signed-in back-office user may see the Invoice (Admin sees every Invoice). */
    boolean visible(InvoiceStore.Invoice invoice) {
        AuthenticatedUser user = currentUser.get();
        if (user.is(Role.ADMIN)) {
            return true;
        }
        if (!user.role().isBackOffice() || user.blockIds().isEmpty()) {
            return false;
        }
        Set<Long> ids = Set.copyOf(user.blockIds());
        return new Scope(ids, buildings.gendersOf(ids)).contains(invoice);
    }
}
