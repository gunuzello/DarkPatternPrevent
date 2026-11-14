CREATE INDEX idx_scan_queue_claim
    ON "Scan"(status, created_at, id);

CREATE INDEX idx_scan_stale_recovery
    ON "Scan"(status, started_at);

CREATE INDEX idx_scan_shop_history
    ON "Scan"(shop_id, created_at DESC);
