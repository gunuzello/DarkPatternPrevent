package com.baromi.backend;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebCorsConfig implements WebMvcConfigurer {
    private final String[] allowedOrigins;

    public WebCorsConfig(@Value("${baromi.web-origins:}") String origins) {
        this.allowedOrigins = Arrays.stream(origins.split(","))
            .map(String::trim).filter(value -> !value.isBlank()).distinct().toArray(String[]::new);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (allowedOrigins.length == 0) return;
        registry.addMapping("/api/**")
            .allowedOrigins(allowedOrigins)
            .allowedMethods("GET", "POST", "PATCH", "OPTIONS")
            .allowedHeaders("Content-Type", "X-Baromi-Owner", "X-Baromi-Worker")
            .maxAge(3600);
    }
}
