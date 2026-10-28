package vn.fpt.campusstay.security;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import vn.fpt.campusstay.service.auth.SessionService;

/**
 * Stateless API security. Coarse role rules by URL prefix live here; finer rules
 * (Block scope, ownership) are enforced in services via {@code BlockScope} and
 * {@code CurrentUser}. Paths are relative to the {@code /api} context path.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, SessionService sessions) throws Exception {
        http
                // Bearer tokens in a header, no cookies: CSRF does not apply.
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {
                })
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .requestCache(cache -> cache.disable())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(JsonSecurityHandlers.unauthorized())
                        .accessDeniedHandler(JsonSecurityHandlers.forbidden()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/auth/sign-in", "/auth/google", "/auth/password/forgot",
                                "/auth/password/reset")
                        .permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/students/**").hasRole("STUDENT")
                        .requestMatchers("/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .addFilterBefore(new BearerTokenFilter(sessions), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    /**
     * In development the web app calls through the Vite proxy (same origin), so
     * CORS matters only when the API is served from another origin. Entries are
     * origin patterns, so one entry such as {@code https://campusstay-*-tisou.vercel.app}
     * also admits the Vercel preview deployments. Auth is a bearer token, not a
     * cookie, so an admitted origin still cannot act as a signed-in user.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${campusstay.cors.allowed-origins:}") List<String> allowedOrigins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(allowedOrigins.stream().map(String::trim).filter(o -> !o.isBlank()).toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setExposedHeaders(List.of("Content-Disposition"));
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
