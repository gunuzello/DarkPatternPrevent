ALTER TABLE "Shop" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'FREE';

CREATE TABLE "AiReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "provider" TEXT,
    "model" TEXT,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "resultJson" TEXT,
    "usageJson" TEXT,
    "error" TEXT,
    CONSTRAINT "AiReview_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AiReview_scanId_key" ON "AiReview"("scanId");
CREATE INDEX "AiReview_status_requestedAt_idx" ON "AiReview"("status", "requestedAt");
