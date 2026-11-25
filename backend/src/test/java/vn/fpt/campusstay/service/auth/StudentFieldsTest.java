package vn.fpt.campusstay.service.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

/** The student list's field parsers. */
class StudentFieldsTest {

    /**
     * TC-AUTH-400 (BE-3RD-19): a four-digit year of birth is a year, never a spreadsheet day number; real day numbers
     * (dates after 1954) and written dates still parse.
     */
    @Test
    void bareYearIsNotASpreadsheetDay() {
        assertThat(StudentFields.date("2005")).isEmpty();
        assertThat(StudentFields.bareYear("2005")).isTrue();
        assertThat(StudentFields.date("38367")).contains(LocalDate.of(2005, 1, 15));
        assertThat(StudentFields.date("15/01/2005")).contains(LocalDate.of(2005, 1, 15));
        assertThat(StudentFields.date("2005-01-15")).contains(LocalDate.of(2005, 1, 15));
    }
}
