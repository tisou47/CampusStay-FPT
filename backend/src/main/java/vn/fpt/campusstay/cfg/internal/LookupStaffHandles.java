package vn.fpt.campusstay.cfg.internal;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.auth.StaffHandles;
import vn.fpt.campusstay.cfg.Lookups;

/** Implements {@link StaffHandles} from the {@code STAFF_HANDLE} option list. */
@Component
class LookupStaffHandles implements StaffHandles {

    private final Lookups lookups;

    LookupStaffHandles(Lookups lookups) {
        this.lookups = lookups;
    }

    @Override
    public Map<String, String> labels() {
        Map<String, String> labels = new LinkedHashMap<>();
        lookups.list("STAFF_HANDLE").forEach(l -> labels.put(l.code(), l.label()));
        return labels;
    }
}
