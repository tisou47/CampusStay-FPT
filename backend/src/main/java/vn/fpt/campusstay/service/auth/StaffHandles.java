package vn.fpt.campusstay.service.auth;

import java.util.Map;

/** Port implemented by Settings: the {@code STAFF_HANDLE} option list, so Auth shows labels without reading Settings tables. */
public interface StaffHandles {

    /** code → label, in display order. */
    Map<String, String> labels();
}
