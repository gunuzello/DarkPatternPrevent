package com.baromi.backend.scan;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import com.baromi.backend.shop.ShopRepository;

@WebMvcTest(ScanController.class)
@Import(ScanController.class)
@TestPropertySource(properties = "baromi.worker-token=test-worker-token")
class ScanControllerTest {
    @Autowired MockMvc mvc;
    @MockBean ScanRepository scans;
    @MockBean ShopRepository shops;

    @Test
    void workerCanImportAndUpdateUnknownScan() throws Exception {
        var scan = new ScanEntity("scan-1", null, "running", Instant.now());
        when(scans.findById("scan-1")).thenReturn(Optional.empty());
        when(scans.save(any(ScanEntity.class))).thenReturn(scan);

        mvc.perform(patch("/api/v1/scans/scan-1/status")
                .header("X-Baromi-Worker", "test-worker-token")
                .contentType("application/json")
                .content("{\"status\":\"running\",\"stage\":\"cart\"}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.scanId").value("scan-1"))
            .andExpect(jsonPath("$.currentStage").value("cart"))
            .andExpect(jsonPath("$.imported").value(true));
    }

    @Test
    void invalidWorkerTokenIsRejected() throws Exception {
        mvc.perform(patch("/api/v1/scans/scan-1/status")
                .header("X-Baromi-Worker", "wrong")
                .contentType("application/json")
                .content("{\"status\":\"running\"}"))
            .andExpect(status().isForbidden());
    }
}
