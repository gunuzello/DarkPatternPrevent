import type { Snapshot } from "./rules";

export function buildPriceLedger(snapshots: Snapshot[]) {
  return {
    version: 1,
    currency: "KRW",
    firstPriceExposure: { status: "NOT_VERIFIED" },
    stages: snapshots.map((snapshot) => ({
      stage: snapshot.stage,
      evidence: {
        id: "page:" + snapshot.stage,
        url: snapshot.url,
        screenshot: snapshot.screenshot,
        capturedAt: snapshot.capturedAt,
      },
      verification: "SCREEN_ONLY",
      displayedLines: snapshot.priceLines,
      options: snapshot.options,
      fees: snapshot.fees,
    })),
  } as const;
}
