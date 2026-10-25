package vn.fpt.campusstay.controller.setting;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.setting.StudentCatalogService;

/**
 * {@code GET /catalog?termId} — every signed-in role. Prices, the Deposit rate and the Utility Deposit
 * are the Term's (ADR-20); without {@code termId}, those of the Term open for registration, else the
 * current Term (C-41).
 */
@RestController
class CatalogController {

    private final StudentCatalogService catalog;

    CatalogController(StudentCatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/catalog")
    StudentCatalogService.StudentCatalog catalog(@RequestParam(required = false) String termId) {
        return catalog.catalog(parseId(termId));
    }

    private static Long parseId(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
