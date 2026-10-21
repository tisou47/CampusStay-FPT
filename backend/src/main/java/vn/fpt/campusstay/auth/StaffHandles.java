package vn.fpt.campusstay.auth;

import java.util.Map;

/** Port implemented by CFG: the {@code STAFF_HANDLE} option list, so AUTH shows labels without reading CFG tables. */
public interface StaffHandles {

    /** code → label, in display order. */
    Map<String, String> labels();
}
