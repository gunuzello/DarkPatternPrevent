const endpoint = () => process.env.BAROMI_SPRING_API_URL?.replace(/\/$/, "");
const springTimeoutMs = () => {
  const configured = Number(process.env.BAROMI_SPRING_TIMEOUT_MS ?? 800);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 200), 5_000) : 800;
};

export async function mirrorSpringShop(shopId: string, url: string, owner: string) {
  const base = endpoint();
  if (!base || !owner) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), springTimeoutMs());
  try {
    const response = await fetch(`${base}/api/v1/shops`, {
      method: "POST", headers: { "content-type": "application/json", "x-baromi-owner": owner },
      body: JSON.stringify({ id: shopId, url, consent: true }), signal: controller.signal,
    });
    if (!response.ok && response.status !== 409) console.warn(`Spring shop mirror failed: ${response.status}`);
  } catch (error) { console.warn("Spring shop mirror unavailable", error instanceof Error ? error.message : error); }
  finally { clearTimeout(timeout); }
}

export async function mirrorSpringScan(scan: { id: string; shopId: string; targetUrl: string; executionMode: string; viewport: string; purchasePath: string }, owner: string) {
  const base = endpoint();
  if (!base || !owner) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), springTimeoutMs());
  try {
    const response = await fetch(`${base}/api/v1/scans`, {
      method: "POST", headers: { "content-type": "application/json", "x-baromi-owner": owner },
      body: JSON.stringify({ id: scan.id, shopId: scan.shopId, targetUrl: scan.targetUrl, executionMode: scan.executionMode, viewport: scan.viewport, purchasePath: scan.purchasePath }),
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 409) console.warn(`Spring scan mirror failed: ${response.status}`);
  } catch (error) { console.warn("Spring scan mirror unavailable", error instanceof Error ? error.message : error); }
  finally { clearTimeout(timeout); }
}

/** Best-effort bridge during the Spring migration. The SQLite path remains authoritative until cutover. */
export async function notifySpringScanStatus(scanId: string, status: "queued" | "running" | "partial" | "succeeded" | "failed" | "cancelled", stage?: string, reportJson?: string) {
  const base = endpoint();
  const token = process.env.BAROMI_WORKER_TOKEN;
  if (!base || !token) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), springTimeoutMs());
  try {
    const response = await fetch(`${base}/api/v1/scans/${encodeURIComponent(scanId)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-baromi-worker": token },
      body: JSON.stringify({ status, stage, ...(reportJson ? { reportJson } : {}) }),
      signal: controller.signal,
    });
    if (!response.ok) console.warn(`Spring scan status callback failed: ${response.status}`);
  } catch (error) {
    console.warn("Spring scan status callback unavailable", error instanceof Error ? error.message : error);
  } finally {
    clearTimeout(timeout);
  }
}
