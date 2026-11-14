package com.baromi.backend;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.TestPropertySource;

@WebMvcTest(HealthController.class)
@Import(HealthController.class)
@TestPropertySource(properties = "baromi.web-origins=https://app.example")
class HealthControllerTest {
    @Autowired MockMvc mvc;
    @MockBean JdbcTemplate jdbc;

    @Test
    void readinessReportsDatabaseHealth() throws Exception {
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(1);

        mvc.perform(get("/api/v1/health/readiness"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ready"))
            .andExpect(jsonPath("$.database").value("ok"));
    }

    @Test
    void readinessReturnsUnavailableWhenDatabaseFails() throws Exception {
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenThrow(new IllegalStateException("db down"));

        mvc.perform(get("/api/v1/health/readiness"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.status").value("not_ready"));
    }

    @Test
    void configuredFrontendOriginCanCallApi() throws Exception {
        mvc.perform(get("/api/v1/health")
                .header("Origin", "https://app.example"))
            .andExpect(status().isOk())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Access-Control-Allow-Origin", "https://app.example"));
    }
}
