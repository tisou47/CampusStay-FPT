package vn.fpt.campusstay.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import jakarta.mail.Message;
import jakarta.mail.internet.MimeMessage;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import vn.fpt.campusstay.service.notification.EmailSender;

/** Where emails go: the recipient, or the demo mailbox of campusstay.mail.redirect-to (TC-NTF-034, 035). */
class EmailSenderConfigTest {

    /** Keeps the messages instead of opening an SMTP connection. */
    static class CapturingSender extends JavaMailSenderImpl {
        final List<MimeMessage> sent = new ArrayList<>();

        @Override
        public void send(MimeMessage message) {
            sent.add(message);
        }
    }

    private static MailProperties props(String redirectTo) {
        return new MailProperties("CampusStay FPT <no-reply@campusstay.test>", 20, 5, Duration.ofMinutes(1), redirectTo);
    }

    private static EmailSender sender(JavaMailSender smtp, MailProperties props) {
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        if (smtp != null) {
            beans.addBean("smtp", smtp);
        }
        return new EmailSenderConfig().emailSender(beans.getBeanProvider(JavaMailSender.class), props);
    }

    /** TC-NTF-034: with a demo mailbox every email goes there, the real recipient in the subject and a header. */
    @Test
    void redirectsToTheDemoMailbox() throws Exception {
        CapturingSender smtp = new CapturingSender();
        sender(smtp, props(" team@example.com ")).send("se190001@fpt.edu.vn", "Reset your password", "<p>Hi</p>");

        MimeMessage message = smtp.sent.getFirst();
        assertThat(message.getRecipients(Message.RecipientType.TO)).extracting(Object::toString)
                .containsExactly("team@example.com");
        assertThat(message.getSubject()).isEqualTo("[to se190001@fpt.edu.vn] Reset your password");
        assertThat(message.getHeader(EmailSenderConfig.ORIGINAL_TO)).containsExactly("se190001@fpt.edu.vn");
    }

    /** TC-NTF-035: without it the email goes to its recipient unchanged; without SMTP nothing is sent or thrown. */
    @Test
    void deliversNormallyOrOnlyLogs() throws Exception {
        CapturingSender smtp = new CapturingSender();
        sender(smtp, props("")).send("se190001@fpt.edu.vn", "Reset your password", "<p>Hi</p>");

        MimeMessage message = smtp.sent.getFirst();
        assertThat(message.getRecipients(Message.RecipientType.TO)).extracting(Object::toString)
                .containsExactly("se190001@fpt.edu.vn");
        assertThat(message.getSubject()).isEqualTo("Reset your password");
        assertThat(message.getHeader(EmailSenderConfig.ORIGINAL_TO)).isNull();

        assertThatCode(() -> sender(null, props("")).send("se190001@fpt.edu.vn", "Subject", "<p>Body</p>"))
                .doesNotThrowAnyException();
    }
}
