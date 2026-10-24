package vn.fpt.campusstay.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import vn.fpt.campusstay.security.AccountSetupGate;

/** Spring MVC additions: the account setup gate (new accounts set their password first, ADR-26). */
@Configuration(proxyBeanMethods = false)
class WebConfig implements WebMvcConfigurer {

    private final AccountSetupGate accountSetupGate;

    WebConfig(AccountSetupGate accountSetupGate) {
        this.accountSetupGate = accountSetupGate;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(accountSetupGate);
    }
}
