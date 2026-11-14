type ClaimedScan = {
  scanId: string;
  targetUrl: string | null;
  executionMode: string | null;
  viewport: string | null;
  purchasePath: string | null;
};

export async function claimSpringScan(): Promise<ClaimedScan | null> {
  const base = process.env.BAROMI_SPRING_API_URL?.replace(/\/$/, "");
  const token = process.env.BAROMI_WORKER_TOKEN;
  if (!base || !token || process.env.BAROMI_SPRING_QUEUE_ENABLED !== "true") return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
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
