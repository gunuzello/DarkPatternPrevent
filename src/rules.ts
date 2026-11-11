import { detectPreselection } from "./detectors/preselection";
import { detectDripPricing } from "./detectors/drip-pricing";
import type { Stage } from "./demo";

type Bounds = { x: number; y: number; width: number; height: number };

export type Option = { label: string; won: number; selected: boolean; bounds: Bounds };
export type Fee = { id: string; label: string; won: number; required: boolean; bounds: Bounds };
export type Snapshot = {
  stage: Stage;
  url: string;
  screenshot: string;
  priceLines: string[];
  options: Option[];
  fees: Fee[];
};
export type Finding = {
  type: "PRESELECTION" | "DRIP_PRICING";
  status: "SUSPECTED";
  ruleVersion: "1" | "2" | "3";
  stage: Stage;
  reason: string;
  evidence: Snapshot[];
};

export function detect([product, ...later]: Snapshot[]): Finding[] {
  if (!product) return [];
  return [...detectPreselection(product), ...detectDripPricing(product, later)];
}
