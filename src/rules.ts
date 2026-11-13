import { detectPreselection } from "./detectors/preselection";
import { detectDripPricing } from "./detectors/drip-pricing";
import { detectUrgencyScarcity } from "./detectors/urgency-scarcity";
import type { Stage } from "./demo";

type Bounds = { x: number; y: number; width: number; height: number };

export type EvidenceLocation = { frame: string; visible: boolean; source: "dom" | "api" };
export type Option = { label: string; won: number; selected: boolean; bounds: Bounds; location?: EvidenceLocation };
export type Fee = { id: string; label: string; won: number; required: boolean; bounds: Bounds; location?: EvidenceLocation };
export type Snapshot = {
  stage: Stage;
  url: string;
  screenshot: string;
  capturedAt?: string;
  screenshotArea?: Bounds;
  priceLines: string[];
  /** Normalized visible text retained for text-only risk signals. */
  textLines?: string[];
  options: Option[];
  fees: Fee[];
};
export type InteractionEvidence = {
  id: string;
  stage: Stage;
  kind: "INITIAL_STATE" | "PAID_OPTION_TOGGLE" | "REQUIRED_OPTION_SELECTION" | "NAVIGATION";
  capturedAt: string;
  controlLabel?: string;
  beforeSelected?: boolean;
  afterSelected?: boolean;
  beforeTotalWon?: number | null;
  afterTotalWon?: number | null;
  amountDeltaWon?: number | null;
  outcome: "OBSERVED" | "NO_LIVE_CHANGE" | "NOT_APPLICABLE";
};
export type NetworkPriceEvidence = {
  id: string;
  stage: Stage;
  url: string;
  capturedAt: string;
  values: { path: string; won: number }[];
};
export type PriorFeeDisclosure = { key: string; won: number };
export type Finding = {
  type: "PRESELECTION" | "DRIP_PRICING" | "URGENCY_SCARCITY";
  status: "SUSPECTED";
  ruleVersion: "1" | "2" | "3";
  stage: Stage;
  reason: string;
  evidence: Snapshot[];
  elementBounds?: Bounds;
};

export function detect([product, ...later]: Snapshot[], priorDisclosures: PriorFeeDisclosure[] = []): Finding[] {
  if (!product) return [];
  return [
    ...detectPreselection(product),
    ...detectDripPricing(product, later, priorDisclosures),
    ...detectUrgencyScarcity(product),
  ];
}
