package vn.fpt.campusstay.cfg.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.cfg.internal.StudentCatalogService;

/**
 * {@code GET /catalog?termId} — every signed-in role. Prices do not depend on the
 * Term yet (an Application snapshots its price), so {@code termId} is accepted
 * and not needed.
 */
@RestController
class CatalogController {

    private final StudentCatalogService catalog;

    CatalogController(StudentCatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/catalog")
    StudentCatalogService.StudentCatalog catalog(@RequestParam(required = false) String termId) {
        return catalog.catalog();
    }
}
