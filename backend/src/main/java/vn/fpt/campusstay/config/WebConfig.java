package vn.fpt.campusstay.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import vn.fpt.campusstay.security.AccountSetupGate;
import vn.fpt.campusstay.security.ShiftGate;

/**
 * Spring MVC additions: the account setup gate (new accounts set their password first, ADR-26), then the shift gate
 * (Staff confirm changes outside their shift or their work, and every change is recorded).
 */
@Configuration(proxyBeanMethods = false)
class WebConfig implements WebMvcConfigurer {

    private final AccountSetupGate accountSetupGate;
    private final ShiftGate shiftGate;

    WebConfig(AccountSetupGate accountSetupGate, ShiftGate shiftGate) {
        this.accountSetupGate = accountSetupGate;
        this.shiftGate = shiftGate;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(accountSetupGate);
        registry.addInterceptor(shiftGate);
    }
}
