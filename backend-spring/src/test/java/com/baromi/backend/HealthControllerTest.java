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

@WebMvcTest(HealthController.class)
@Import(HealthController.class)
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
}
