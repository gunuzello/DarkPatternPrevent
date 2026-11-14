const endpoint = () => process.env.BAROMI_SPRING_API_URL?.replace(/\/$/, "");
export const springAuthoritative = () => process.env.BAROMI_SPRING_AUTHORITATIVE === "true" && Boolean(endpoint());
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

/** Read-through access used only after Spring/PostgreSQL has passed cutover checks. */
export async function readSpringScan(scanId: string, owner: string, report = false) {
  const base = endpoint();
  if (!base || !owner || !springAuthoritative()) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), springTimeoutMs());
  try {
    const response = await fetch(`${base}/api/v1/scans/${encodeURIComponent(scanId)}${report ? "/report" : ""}`, {
      headers: { "x-baromi-owner": owner }, signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Spring scan read failed: ${response.status}`);
    return await response.json() as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Spring 상태 저장소 응답 시간 초과");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
