package vn.fpt.campusstay.common.i18n;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** How the API's English messages become Vietnamese (ADR-25; TC-NTF-036, 037). */
class MessagesTest {

    private final Messages messages = new Messages();

    /** TC-NTF-036: exact texts and texts with values are translated, a value from the catalog too; English stays English. */
    @Test
    void translatesExactTextsAndTemplates() {
        assertThat(messages.translate("This Invoice does not exist.", Locales.VI)).isEqualTo("Hóa đơn này không tồn tại.");
        assertThat(messages.translate("Block C does not exist.", Locales.VI)).isEqualTo("Tòa C không tồn tại.");
        assertThat(messages.translate("Floor 7 does not exist in Block A.", Locales.VI))
                .isEqualTo("Tầng 7 không có trong Tòa A.");
        assertThat(messages.translate("This Invoice cannot be paid: it is overdue.", Locales.VI))
                .isEqualTo("Không thể thanh toán hóa đơn này: hóa đơn đang ở trạng thái quá hạn.");
        assertThat(messages.translate("This Invoice does not exist.", Locales.EN)).isEqualTo("This Invoice does not exist.");
    }

    /** TC-NTF-037: a text without a translation, an unknown language and null are returned unchanged. */
    @Test
    void keepsWhatItCannotTranslate() {
        assertThat(messages.translate("A brand-new message nobody translated.", Locales.VI))
                .isEqualTo("A brand-new message nobody translated.");
        assertThat(messages.translate("This Invoice does not exist.", null)).isEqualTo("This Invoice does not exist.");
        assertThat(messages.translate(null, Locales.VI)).isNull();
        assertThat(Locales.parse("vi-VN")).isEqualTo(Locales.VI);
        assertThat(Locales.parse("en-US,en;q=0.9")).isEqualTo(Locales.EN);
        assertThat(Locales.parse("fr")).isNull();
    }

    /**
     * TC-NTF-500: every error message written as one literal in the code (ApiException, FieldErrors) has its Vietnamese
     * text (BE-PLT-24). Messages built from parts are checked by their own tests.
     */
    @Test
    void everyLiteralErrorMessageIsTranslated() throws java.io.IOException {
        java.util.regex.Pattern call = java.util.regex.Pattern.compile(
                "(?:ApiException\\.\\w+\\(|new ApiException\\(|FieldErrors\\.single\\(|errors\\.(?:add|check)\\()[^;]*?[(,]\\s*\"([A-Z][^\"]{8,}[.?!])\"\\s*\\)",
                java.util.regex.Pattern.DOTALL);
        java.util.List<String> missing = new java.util.ArrayList<>();
        try (var files = java.nio.file.Files.walk(java.nio.file.Path.of("src/main/java"))) {
            for (java.nio.file.Path f : files.filter(x -> x.toString().endsWith(".java")).toList()) {
                var m = call.matcher(java.nio.file.Files.readString(f));
                while (m.find()) {
                    if (messages.translate(m.group(1), Locales.VI).equals(m.group(1))) {
                        missing.add(f.getFileName() + ": " + m.group(1));
                    }
                }
            }
        }
        assertThat(missing).isEmpty();
    }
}
