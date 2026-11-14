type ClaimedScan = {
  scanId: string;
  targetUrl: string | null;
  executionMode: string | null;
  viewport: string | null;
  purchasePath: string | null;
};

const springTimeoutMs = () => {
  const configured = Number(process.env.BAROMI_SPRING_TIMEOUT_MS ?? 800);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 200), 5_000) : 800;
};

export function isClaimCompatible(local: { status: string; targetUrl: string } | null, claimed: Pick<ClaimedScan, "targetUrl">) {
  return local?.status === "QUEUED" && local.targetUrl === claimed.targetUrl;
}

export async function claimSpringScan(): Promise<ClaimedScan | null> {
  const base = process.env.BAROMI_SPRING_API_URL?.replace(/\/$/, "");
  const token = process.env.BAROMI_WORKER_TOKEN;
  if (!base || !token || process.env.BAROMI_SPRING_QUEUE_ENABLED !== "true") return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), springTimeoutMs());
  try {
    const response = await fetch(`${base}/api/v1/scans/claim`, {
      method: "POST", headers: { "x-baromi-worker": token }, signal: controller.signal,
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Spring queue claim failed: ${response.status}`);
    return await response.json() as ClaimedScan;
  } finally {
    clearTimeout(timeout);
  }
}

export async function recoverSpringScans(staleBefore: Date): Promise<number> {
  const base = process.env.BAROMI_SPRING_API_URL?.replace(/\/$/, "");
  const token = process.env.BAROMI_WORKER_TOKEN;
  if (!base || !token || process.env.BAROMI_SPRING_QUEUE_ENABLED !== "true") return 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), springTimeoutMs());
  try {
    const response = await fetch(`${base}/api/v1/scans/recover`, {
      method: "POST", headers: { "content-type": "application/json", "x-baromi-worker": token },
      body: JSON.stringify({ staleBefore: staleBefore.toISOString() }), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Spring queue recovery failed: ${response.status}`);
    const result = await response.json() as { recovered?: number };
    return result.recovered ?? 0;
  } finally {
    clearTimeout(timeout);
  }
}
