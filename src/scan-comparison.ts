import type { Stage } from "./demo";
import type { Finding } from "./rules";

// Update when rule behavior or the observations used for a decision change.
export const scanComparisonVersion = 1;

type Signal = Pick<Finding, "type" | "stage" | "reason" | "ruleVersion">;
type ComparableReport = {
  comparisonVersion?: number;
  targetUrl: string;
  scenario: string;
  snapshots: { stage: Stage; url: string }[];
  findings: Signal[];
};

const signalKey = ({ type, stage, reason, ruleVersion }: Signal) =>
  JSON.stringify([type, stage, reason, ruleVersion]);

export function compareScans(before: ComparableReport, after: ComparableReport) {
  if (before.comparisonVersion !== scanComparisonVersion || after.comparisonVersion !== scanComparisonVersion) {
    return { status: "UNAVAILABLE", reason: "두 보고서의 비교 형식이 다릅니다." } as const;
  }
  if (before.targetUrl !== after.targetUrl || before.scenario !== after.scenario ||
      !before.snapshots.length || before.snapshots.length !== after.snapshots.length ||
      before.snapshots.some(({ stage, url }, index) =>
        stage !== after.snapshots[index].stage || url !== after.snapshots[index].url)) {
    return { status: "UNAVAILABLE", reason: "두 진단의 상품, 페이지 또는 검사 범위가 다릅니다." } as const;
  }

  const unmatched = [...before.findings];
  const repeated: Signal[] = [];
  const added: Signal[] = [];
  for (const finding of after.findings) {
    const index = unmatched.findIndex((previous) => signalKey(previous) === signalKey(finding));
    if (index === -1) {
      added.push(finding);
    } else {
      repeated.push(finding);
      unmatched.splice(index, 1);
    }
  }
  return {
    status: "COMPARED",
    repeated: repeated.map(signalSummary),
    added: added.map(signalSummary),
    notObserved: unmatched.map(signalSummary),
  } as const;
}

function signalSummary({ type, stage, reason, ruleVersion }: Signal) {
  return { type, stage, reason, ruleVersion };
}
