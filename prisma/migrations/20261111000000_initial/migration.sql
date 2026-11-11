CREATE TABLE "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenario" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportPath" TEXT
);

CREATE TABLE "Finding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scanId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    CONSTRAINT "Finding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Finding_scanId_idx" ON "Finding"("scanId");
