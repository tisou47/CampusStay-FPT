package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;

/** Settings public API: Admin › System parameters ({@code cfg_parameter}) by key. */
public interface Parameters {

    /** @throws IllegalStateException when the key is missing or not a whole number (a migration bug) */
    int intValue(String key);

    /** The stored text, e.g. the value of a choice parameter. @throws IllegalStateException when the key is missing */
    String textValue(String key);

    /** A DECIMAL parameter. @throws IllegalStateException when the key is missing or not a number */
    BigDecimal decimalValue(String key);

    /** A BOOL parameter ({@code true} / {@code false}). @throws IllegalStateException when the key is missing */
    boolean boolValue(String key);
}
