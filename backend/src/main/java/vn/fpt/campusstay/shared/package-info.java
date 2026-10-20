/**
 * Shared kernel: error model, list/paging DTOs, audit log, clock, tokens.
 * <p>Open module: every business module may use all of its types. It must never
 * depend on a business module; where it needs data from one (the current actor),
 * it declares an interface that the business module implements.
 */
@ApplicationModule(displayName = "Shared kernel", type = ApplicationModule.Type.OPEN)
package vn.fpt.campusstay.shared;

import org.springframework.modulith.ApplicationModule;
