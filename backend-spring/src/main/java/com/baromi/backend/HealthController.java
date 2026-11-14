package com.baromi.backend;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController
public class HealthController {
    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping("/api/v1/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "service", "baromi-backend", "version", "0.1.0");
    }

    @GetMapping("/api/v1/health/readiness")
    public ResponseEntity<Map<String, Object>> readiness() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return ResponseEntity.ok(Map.of("status", "ready", "database", "ok"));
        } catch (RuntimeException failure) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("status", "not_ready", "database", "unavailable"));
        }
    }
}

