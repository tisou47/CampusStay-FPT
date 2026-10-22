package vn.fpt.campusstay.service.setting;

/** Settings public API: Admin › System parameters ({@code cfg_parameter}) by key. */
public interface Parameters {

    /** @throws IllegalStateException when the key is missing or not a whole number (a migration bug) */
    int intValue(String key);

    /** The stored text, e.g. the value of a choice parameter. @throws IllegalStateException when the key is missing */
    String textValue(String key);
}
