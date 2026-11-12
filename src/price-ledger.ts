import type { NetworkPriceEvidence, Snapshot } from "./rules";

const amounts = (lines: string[]) => new Set(lines.flatMap((line) =>
  [...line.matchAll(/(?:₩\s*)?(\d[\d,]*)\s*원/g)].map((match) => Number(match[1].replaceAll(",", ""))),
));

export function buildPriceLedger(snapshots: Snapshot[], network: NetworkPriceEvidence[] = []) {
  return {
    version: 1,
    currency: "KRW",
    firstPriceExposure: { status: "NOT_VERIFIED" },
    stages: snapshots.map((snapshot) => {
      const screenAmounts = amounts(snapshot.priceLines);
      const observed = network.filter((item) => item.stage === snapshot.stage).flatMap((item) =>
        item.values.map((value) => ({ evidenceId: item.id, ...value, matchedScreen: screenAmounts.has(value.won) })),
      );
      const matched = observed.filter((item) => item.matchedScreen).length;
      const verification = !observed.length ? "SCREEN_ONLY"
        : matched === observed.length ? "SCREEN_NETWORK_AGREE"
          : matched ? "SCREEN_NETWORK_PARTIAL" : "SCREEN_NETWORK_DISAGREE";
      return {
      stage: snapshot.stage,
      evidence: {
        id: "page:" + snapshot.stage,
        url: snapshot.url,
        screenshot: snapshot.screenshot,
        capturedAt: snapshot.capturedAt,
      },
      verification,
      displayedLines: snapshot.priceLines,
      networkValues: observed,
      options: snapshot.options,
      fees: snapshot.fees,
    }; }),
  } as const;
}
