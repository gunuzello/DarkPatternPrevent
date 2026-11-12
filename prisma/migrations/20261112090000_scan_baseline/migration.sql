ALTER TABLE "Scan" ADD COLUMN "baselineScanId" TEXT REFERENCES "Scan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Scan_baselineScanId_idx" ON "Scan"("baselineScanId");
