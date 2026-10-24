package vn.fpt.campusstay;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.bearer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Two languages (ADR-25): the account's language, error messages and notifications in Vietnamese or English. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LocaleIT {

    @Autowired
    MockMvc mvc;

    /** TC-AUTH-036: the user carries the account's language; the account changes it; only vi and en are accepted. */
    @Test
    void accountLanguage() throws Exception {
        String auth = bearer(mvc, StayFlow.student(45));
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk()).andExpect(jsonPath("$.locale").value("en")); // the test seed is in English
        mvc.perform(put("/auth/me/locale").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"locale\":\"vi\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, auth)).andExpect(jsonPath("$.locale").value("vi"));
        mvc.perform(put("/auth/me/locale").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"locale\":\"fr\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.locale").value("Choose vi or en."));
        mvc.perform(put("/auth/me/locale").contentType(MediaType.APPLICATION_JSON).content("{\"locale\":\"en\"}"))
                .andExpect(status().isUnauthorized());
    }

    /** TC-AUTH-037: with Accept-Language: vi errors and field messages are Vietnamese, the code unchanged; English without. */
    @Test
    void errorsInTheRequestLanguage() throws Exception {
        String body = "{\"email\":\"" + ADMIN + "\",\"password\":\"Wrong12345\"}";
        mvc.perform(post("/auth/sign-in").header(HttpHeaders.ACCEPT_LANGUAGE, "vi").contentType(MediaType.APPLICATION_JSON)
                .content(body))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.message").value("Email hoặc mật khẩu không đúng."));
        mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(jsonPath("$.message").value("Email or password is incorrect."));
        mvc.perform(post("/auth/sign-in").header(HttpHeaders.ACCEPT_LANGUAGE, "vi").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"\",\"password\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Một số trường chưa hợp lệ. Hãy kiểm tra các trường được đánh dấu."))
                .andExpect(jsonPath("$.details.fields.password").value("Hãy nhập mật khẩu."));
        mvc.perform(get("/auth/me").header(HttpHeaders.ACCEPT_LANGUAGE, "vi"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại."));
    }

    /** TC-NTF-038: a notification keeps both texts; the Notification Center shows the reader's language. */
    @Test
    void notificationsInBothLanguages() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(post("/admin/notification-templates/PAYMENT_CONFIRMED/test").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isNoContent());
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, admin).header(HttpHeaders.ACCEPT_LANGUAGE, "vi"))
                .andExpect(jsonPath("$.items[0].title").value("[Thử] Đã nhận thanh toán"))
                .andExpect(jsonPath("$.items[0].body").value("Đã nhận 1,500,000 VND cho Shower leaks."));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[0].title").value("[Test] Payment received"))
                .andExpect(jsonPath("$.items[0].body").value("We received 1,500,000 VND for Shower leaks."));
        mvc.perform(get("/admin/notification-templates").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.key == 'PAYMENT_CONFIRMED')].bodyVi")
                        .value(org.hamcrest.Matchers.hasItem("Đã nhận {{amount}} cho {{title}}.")));
    }
}
