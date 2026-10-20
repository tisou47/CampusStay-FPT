package vn.fpt.campusstay.cfg;

/** CFG public API: Admin › System parameters ({@code cfg_parameter}) by key. */
public interface Parameters {

    /** @throws IllegalStateException when the key is missing or not a whole number (a migration bug) */
    int intValue(String key);
}
