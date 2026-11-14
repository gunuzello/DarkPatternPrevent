const endpoint = () => process.env.BAROMI_SPRING_API_URL?.replace(/\/$/, "");

/** Best-effort bridge during the Spring migration. The SQLite path remains authoritative until cutover. */
export async function notifySpringScanStatus(scanId: string, status: "queued" | "running" | "partial" | "succeeded" | "failed" | "cancelled", stage?: string) {
  const base = endpoint();
  const token = process.env.BAROMI_WORKER_TOKEN;
  if (!base || !token) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${base}/api/v1/scans/${encodeURIComponent(scanId)}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-baromi-worker": token },
      body: JSON.stringify({ status, stage }),
      signal: controller.signal,
    });
    if (!response.ok) console.warn(`Spring scan status callback failed: ${response.status}`);
  } catch (error) {
    console.warn("Spring scan status callback unavailable", error instanceof Error ? error.message : error);
  } finally {
    clearTimeout(timeout);
  }
}
