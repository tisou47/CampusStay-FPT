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
 * SMTP when {@code spring.mail.host} is set (Mailpit in dev, Gmail SMTP with an
 * App Password for the demo); otherwise a logging sender so the app still runs.
 */
@Configuration(proxyBeanMethods = false)
class EmailSenderConfig {

    private static final Logger log = LoggerFactory.getLogger(EmailSenderConfig.class);

    @Bean
    EmailSender emailSender(ObjectProvider<JavaMailSender> mailSender, MailProperties props) {
        JavaMailSender smtp = mailSender.getIfAvailable();
        if (smtp == null) {
            log.warn("spring.mail.host is not set: emails are written to the log instead of being sent");
            return (to, subject, html) -> log.info("EMAIL to={} subject={}\n{}", to, subject, html);
        }
        return (to, subject, html) -> {
            MimeMessage message = smtp.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(props.from());
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(html, true);
            smtp.send(message);
        };
    }
}
