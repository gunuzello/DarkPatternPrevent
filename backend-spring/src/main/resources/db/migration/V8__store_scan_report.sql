ALTER TABLE "Scan" ADD COLUMN report_json TEXT;
ALTER TABLE "Scan" ADD COLUMN report_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_scan_report_retention
    ON "Scan"(report_expires_at);
