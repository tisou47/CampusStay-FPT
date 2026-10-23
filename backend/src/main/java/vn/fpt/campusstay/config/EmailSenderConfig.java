package vn.fpt.campusstay.config;

import java.nio.charset.StandardCharsets;

import jakarta.mail.internet.MimeMessage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import vn.fpt.campusstay.service.notification.EmailSender;

/**
 * SMTP when {@code spring.mail.host} is set (Mailpit in dev, Gmail SMTP with an App Password for the demo);
 * otherwise a sender that only logs the subject, so the app still runs. With {@code campusstay.mail.redirect-to}
 * every email goes to that one mailbox (demo servers, whose seed accounts have fictional addresses).
 */
@Configuration(proxyBeanMethods = false)
class EmailSenderConfig {

    /** Header that keeps the real recipient of a redirected email. */
    static final String ORIGINAL_TO = "X-CampusStay-Original-To";

    private static final Logger log = LoggerFactory.getLogger(EmailSenderConfig.class);

    @Bean
    EmailSender emailSender(ObjectProvider<JavaMailSender> mailSender, MailProperties props) {
        JavaMailSender smtp = mailSender.getIfAvailable();
        if (smtp == null) {
            log.warn("spring.mail.host is not set: emails are not sent, only their subject is logged");
            // Never the address or the body: bodies hold sign-in links and personal data (CLAUDE.md).
            return (to, subject, html) -> log.info("EMAIL not sent (no SMTP): subject={}", subject);
        }
        if (props.redirecting()) {
            log.warn("campusstay.mail.redirect-to is set: every email goes to one demo mailbox");
        }
        return (to, subject, html) -> {
            MimeMessage message = smtp.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(props.from());
            if (props.redirecting()) {
                helper.setTo(props.redirectTo().trim());
                helper.setSubject("[to " + to + "] " + subject);
                message.setHeader(ORIGINAL_TO, to);
            } else {
                helper.setTo(to);
                helper.setSubject(subject);
            }
            helper.setText(html, true);
            smtp.send(message);
        };
    }
}
