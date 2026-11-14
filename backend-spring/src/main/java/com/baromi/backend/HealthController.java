package com.baromi.backend;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController
public class HealthController {
    @GetMapping("/api/v1/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "service", "baromi-backend", "version", "0.1.0");
    }
}

