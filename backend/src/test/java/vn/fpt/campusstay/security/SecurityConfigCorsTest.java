package vn.fpt.campusstay.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;

/** CORS origins for the deployed web app (ADR-16). Test case IDs follow TC-AUTH-NNN (Report 5). */
class SecurityConfigCorsTest {

    private CorsConfiguration cors(String... origins) {
        var source = new SecurityConfig().corsConfigurationSource(List.of(origins));
        return source.getCorsConfiguration(new MockHttpServletRequest("GET", "/terms"));
    }

    /** TC-AUTH-034: an exact origin and a Vercel preview pattern are both admitted. */
    @Test
    void admitsExactOriginAndPreviewPattern() {
        CorsConfiguration config = cors("https://campusstay-fpt-ten.vercel.app", " https://campusstay-*-tisou.vercel.app");

        assertThat(config.checkOrigin("https://campusstay-fpt-ten.vercel.app"))
                .isEqualTo("https://campusstay-fpt-ten.vercel.app");
        assertThat(config.checkOrigin("https://campusstay-1qin9eihu-tisou.vercel.app"))
                .isEqualTo("https://campusstay-1qin9eihu-tisou.vercel.app");
        assertThat(config.checkOrigin("https://campusstay-fpt-git-main-tisou.vercel.app"))
                .isEqualTo("https://campusstay-fpt-git-main-tisou.vercel.app");
    }

    /** TC-AUTH-035 (negative): other origins are refused, and a blank setting keeps CORS closed. */
    @Test
    void refusesOtherOriginsAndBlankSetting() {
        assertThat(cors("https://campusstay-fpt-ten.vercel.app").checkOrigin("https://evil.example")).isNull();
        assertThat(cors("").checkOrigin("https://campusstay-fpt-ten.vercel.app")).isNull();
    }
}
