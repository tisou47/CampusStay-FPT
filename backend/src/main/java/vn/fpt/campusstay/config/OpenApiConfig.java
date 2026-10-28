package vn.fpt.campusstay.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;

/** OpenAPI metadata and the bearer-token input displayed by Swagger UI. */
@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {

    @Bean
    OpenAPI campusStayOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("CampusStay FPT API")
                        .description("Dormitory registration and room-scheduling API")
                        .version("0.1.0"))
                .components(new Components().addSecuritySchemes("bearerAuth",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("Bearer token")));
    }
}
