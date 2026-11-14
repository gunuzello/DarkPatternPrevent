package com.baromi.backend.scan;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import com.baromi.backend.shop.ShopController;
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

    @Test
    void terminalScanCannotMoveBackToRunning() throws Exception {
        var scan = new ScanEntity("scan-terminal", "shop-1", "succeeded", Instant.now());
        when(scans.findById("scan-terminal")).thenReturn(Optional.of(scan));

        mvc.perform(patch("/api/v1/scans/scan-terminal/status")
                .header("X-Baromi-Worker", "test-worker-token")
                .contentType("application/json")
                .content("{\"status\":\"running\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.status").value("succeeded"));
    }

    @Test
    void workerCanClaimQueuedScanWithExecutionConfig() throws Exception {
        var scan = new ScanEntity("scan-2", "shop-1", "queued", Instant.now(), "https://shop.example/product", "DYNAMIC", "DESKTOP", "CART");
        when(scans.findFirstByStatusOrderByCreatedAtAscIdAsc("queued")).thenReturn(Optional.of(scan));
        when(scans.save(any(ScanEntity.class))).thenReturn(scan);

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/scans/claim")
                .header("X-Baromi-Worker", "test-worker-token"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.scanId").value("scan-2"))
            .andExpect(jsonPath("$.status").value("running"))
            .andExpect(jsonPath("$.targetUrl").value("https://shop.example/product"))
            .andExpect(jsonPath("$.executionMode").value("DYNAMIC"));
    }

    @Test
    void workerCanRecoverOnlyStaleRunningScans() throws Exception {
        var staleBefore = Instant.parse("2026-11-14T00:00:00Z");
        var scan = new ScanEntity("scan-3", "shop-1", "running", Instant.parse("2026-11-13T23:00:00Z"));
        when(scans.findByStatusAndStartedAtBefore("running", staleBefore)).thenReturn(java.util.List.of(scan));
        when(scans.save(any(ScanEntity.class))).thenReturn(scan);

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/scans/recover")
                .header("X-Baromi-Worker", "test-worker-token")
                .contentType("application/json")
                .content("{\"staleBefore\":\"2026-11-14T00:00:00Z\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.recovered").value(1));
        verify(scans).save(scan);
    }

    @Test
    void ownerCanListOnlyTheirShopScans() throws Exception {
        var shop = new com.baromi.backend.shop.ShopEntity("shop-1", "https://shop.example", ShopController.ownerHashForApi("owner-1"), Instant.now());
        var scan = new ScanEntity("scan-4", "shop-1", "succeeded", Instant.now());
        when(shops.findByIdAndOwnerHash("shop-1", ShopController.ownerHashForApi("owner-1"))).thenReturn(Optional.of(shop));
        when(scans.findByShopIdOrderByCreatedAtDesc("shop-1")).thenReturn(java.util.List.of(scan));

        mvc.perform(get("/api/v1/scans/shop/shop-1").header("X-Baromi-Owner", "owner-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.shopId").value("shop-1"))
            .andExpect(jsonPath("$.scans[0].scanId").value("scan-4"));
    }

    @Test
    void scanTargetMustStayOnRegisteredHttpsOrigin() throws Exception {
        var shop = new com.baromi.backend.shop.ShopEntity("shop-safe", "https://shop.example", ShopController.ownerHashForApi("owner-1"), Instant.now());
        when(shops.findByIdAndOwnerHash("shop-safe", ShopController.ownerHashForApi("owner-1"))).thenReturn(Optional.of(shop));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/scans")
                .header("X-Baromi-Owner", "owner-1")
                .contentType("application/json")
                .content("{\"id\":\"scan-safe\",\"shopId\":\"shop-safe\",\"targetUrl\":\"https://attacker.example/\",\"executionMode\":\"DYNAMIC\"}"))
            .andExpect(status().isBadRequest());
    }
}
