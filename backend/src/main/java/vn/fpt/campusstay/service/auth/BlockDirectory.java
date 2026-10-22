package vn.fpt.campusstay.service.auth;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Port implemented by Inventory: translates Block codes (API) to Building ids (DB)
 * without Auth reading Inventory tables.
 */
public interface BlockDirectory {

    Optional<Long> findIdByCode(String code);

    /** id → code for the given ids, in Block code order. */
    Map<Long, String> codesByIds(Collection<Long> ids);

    Set<Long> allActiveIds();
}
