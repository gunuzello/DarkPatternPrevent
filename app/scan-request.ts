export async function post(path: string, body: object) {
  const response = await fetch("/api/v1/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "요청에 실패했습니다.");
  return result;
}

export function scanRequest(shopId: string, baselineScanId?: string, profile: "CONTEST" | "DYNAMIC" = "CONTEST") {
  return { shopId, baselineScanId, profile, flows: ["PURCHASE"], productLimit: 1, viewport: "DESKTOP" };
}
