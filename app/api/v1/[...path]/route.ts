import { createHash, randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../src/db";
import { stages } from "../../../../src/demo";
import type { Stage } from "../../../../src/demo";
import { evidenceDirectory } from "../../../../src/evidence-directory";
import { scanTarget, demoOrigin } from "../../../../src/targets";
import { compareScans } from "../../../../src/scan-comparison";
import type { scanDemo } from "../../../../src/scan";
import { fetchPublicHtml } from "../../../../src/public-html";
import { createSiteVerification, hashToken, matchesVerification, verificationDnsPrefix, verificationFile, verificationName } from "../../../../src/site-verification";
import { encryptCredentials } from "../../../../src/credential-vault";
import { mirrorSpringScan, mirrorSpringShop, notifySpringScanStatus, readSpringScan, springAuthoritative } from "../../../../src/spring-status";
import { diagnosticSurfaceKinds, type DiagnosticSurfaceKind } from "../../../../src/diagnostic-surfaces";

type Context = { params: Promise<{ path: string[] }> };
type Report = Omit<Awaited<ReturnType<typeof scanDemo>>, "scenario"> & { scenario: string };
const cookie = "darkpattern-session";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const error = (message: string, status: number) => Response.json({ error: message }, { status });
const notFound = () => error("요청한 항목을 찾을 수 없습니다.", 404);
const rateBuckets = new Map<string, number[]>();
const rateLimit = (request: NextRequest, key: string, limit: number, windowMs: number) => {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const bucketKey = `${address}:${key}`;
  const now = Date.now();
  const recent = (rateBuckets.get(bucketKey) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) return Response.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, {
    status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) },
  });
  recent.push(now);
  rateBuckets.set(bucketKey, recent);
  return null;
};

async function getReport(path: string | null): Promise<Report | null> {
  return path ? JSON.parse(await readFile(path, "utf8")) : null;
}

export async function POST(request: NextRequest, context: Context) {
  const route = (await context.params).path;
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return error("JSON 요청이 필요합니다.", 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64 * 1024) return error("요청 본문이 너무 큽니다.", 413);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(demoOrigin()).origin) return error("동일 출처 요청이 필요합니다.", 403);
  const body = await request.json().catch(() => null);
  const session = request.cookies.get(cookie)?.value;

  if (route.join("/") === "shops") {
    const limited = rateLimit(request, "shops", 20, 60 * 60 * 1000);
    if (limited) return limited;
    const target = scanTarget(body?.url);
    if (body?.consent !== true || !target) {
      return error("공개 HTTPS 쇼핑몰 URL과 검사 동의가 필요합니다.", 400);
    }
    const token = session ?? randomUUID();
    const verification = createSiteVerification();
    const shop = await db().shop.create({
      data: { id: randomUUID(), url: target.url, ownerHash: hash(token), verificationHash: verification.hash },
    });
    const response = NextResponse.json({
      shopId: shop.id, url: shop.url,
      verification: target.scenario === "public" ? {
        name: verificationName, token: verification.token,
        metaTag: `<meta name="${verificationName}" content="${verification.token}">`,
        filePath: `/${verificationFile}`,
        dnsRecord: `${verificationDnsPrefix}.${new URL(shop.url).hostname} TXT ${verification.token}`,
      } : null,
    }, { status: 201 });
    await mirrorSpringShop(shop.id, shop.url, token);
    if (!session) response.cookies.set(cookie, token, {
      httpOnly: true, sameSite: "strict", path: "/", maxAge: 24 * 60 * 60,
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  }

  if (!session) return notFound();
  const ownerHash = hash(session);
  if (route[0] === "shops" && route[1] && route[2] === "verify" && route.length === 3) {
    const shop = await db().shop.findFirst({ where: { id: route[1], ownerHash } });
    if (!shop) return notFound();
    if (!shop.verificationHash) return error("확인 값을 다시 발급해 주세요.", 409);
    const target = scanTarget(shop.url);
    if (!target) return error("지원하는 쇼핑몰 주소가 아닙니다.", 400);
    if (target.scenario !== "public") {
      const verifiedAt = new Date();
      await db().shop.update({ where: { id: shop.id }, data: { verifiedAt } });
      return Response.json({ verified: true, verifiedAt });
    }
    // Prove control of the storefront itself, not merely a user-supplied deep URL.
    const verificationUrl = new URL("/", shop.url).href;
    const document = await fetchPublicHtml(verificationUrl).catch(() => null);
    let verifiedBy: "meta" | "file" | "dns" | null = document && matchesVerification(document.html, shop.verificationHash) ? "meta" : null;
    if (!verifiedBy) {
      const fileUrl = new URL(`/${verificationFile}`, shop.url).href;
      const fileToken = await fetch(fileUrl, { redirect: "manual", signal: AbortSignal.timeout(8000) })
        .then(async (response) => response.ok ? (await response.text()).trim() : null).catch(() => null);
      if (fileToken && fileToken.length <= 256 && /^[A-Za-z0-9_-]+$/.test(fileToken) && hashToken(fileToken) === shop.verificationHash) verifiedBy = "file";
    }
    if (!verifiedBy) {
      const hostname = new URL(shop.url).hostname;
      const txt = await resolveTxt(`${verificationDnsPrefix}.${hostname}`).catch(() => [] as string[][]);
      const values = txt.flat().map((value) => value.trim());
      if (values.some((value) => value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value) && hashToken(value) === shop.verificationHash)) verifiedBy = "dns";
    }
    if (!verifiedBy) return error(`메타 태그, ${verificationFile} 파일 또는 DNS TXT에서 확인 값을 찾지 못했습니다.`, 409);
    const verified = await db().shop.update({ where: { id: shop.id }, data: { verifiedAt: new Date() } });
    return Response.json({ verified: true, verifiedAt: verified.verifiedAt, method: verifiedBy });
  }
  if (route.join("/") === "scans" && typeof body?.shopId === "string") {
    const limited = rateLimit(request, "scans", 30, 60 * 60 * 1000);
    if (limited) return limited;
    const shop = await db().shop.findFirst({ where: { id: body.shopId, ownerHash } });
    if (!shop) return notFound();
    const target = scanTarget(shop.url);
    if (!target) return error("지원하는 쇼핑몰 주소가 아닙니다.", 400);
    if (body.purchasePath !== undefined && !["CART", "DIRECT"].includes(body.purchasePath)) {
      return error("구매 경로는 CART 또는 DIRECT여야 합니다.", 400);
    }
    const credentials = body.credentials;
    if (credentials !== undefined && (body.profile !== "DYNAMIC" || typeof credentials !== "object" ||
        typeof credentials.username !== "string" || typeof credentials.password !== "string")) {
      return error("테스트 계정은 동적 진단에서만 username/password 형식으로 제공해야 합니다.", 400);
    }
    let credentialCiphertext: string | undefined;
    if (body.profile === "DYNAMIC" && credentials) {
      try { credentialCiphertext = encryptCredentials(credentials); }
      catch (cause) { return error(cause instanceof Error ? cause.message : "테스트 계정을 보호할 수 없습니다.", 503); }
    }
    const purchasePath = body.purchasePath === "DIRECT" ? "DIRECT" : "CART";
    if (!["CONTEST", "DYNAMIC"].includes(body.profile) || !["DESKTOP", "MOBILE"].includes(body.viewport) ||
        !Array.isArray(body.flows) || body.flows.length !== 1 || body.flows[0] !== "PURCHASE" ||
        body.productLimit !== 1) {
      return error("PC 또는 모바일 구매 흐름에서 상품 1개를 진단할 수 있습니다.", 400);
    }
    if (body.profile === "DYNAMIC" && (target.scenario !== "public" || (!shop.verifiedAt && !body.credentials))) {
      return error("사이트 확인을 마친 외부 쇼핑몰만 동적 진단할 수 있습니다.", 409);
    }
    const baselineScanId = body.baselineScanId;
    if (baselineScanId !== undefined) {
      if (typeof baselineScanId !== "string") return error("기준 진단 ID를 확인해 주세요.", 400);
      const baseline = await db().scan.findFirst({
        where: {
          id: baselineScanId, shopId: shop.id, targetUrl: target.url, scenario: target.scenario,
          viewport: body.viewport, purchasePath,
          status: { in: ["COMPLETED", "PARTIAL"] }, reportPath: { not: null },
        },
        select: { id: true },
      });
      if (!baseline) return notFound();
    }
    if (baselineScanId === undefined) {
      const existing = await db().scan.findFirst({
        where: {
          shopId: shop.id, targetUrl: target.url, scenario: target.scenario,
          executionMode: body.profile === "DYNAMIC" ? "DYNAMIC" : "STATIC",
          viewport: body.viewport, purchasePath, status: { in: ["QUEUED", "RUNNING"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, createdAt: true },
      });
      if (existing) return Response.json({ scanId: existing.id, status: existing.status, createdAt: existing.createdAt, deduplicated: true }, { status: 202 });
    }
    const scan = await db().scan.create({
      data: {
        id: randomUUID(), shopId: shop.id, targetUrl: target.url, scenario: target.scenario,
        executionMode: body.profile === "DYNAMIC" ? "DYNAMIC" : "STATIC", viewport: body.viewport,
        purchasePath,
        credentialCiphertext,
        baselineScanId, status: "QUEUED",
      },
    });
    // During the Spring migration, mirror the queue state without making the
    // legacy SQLite path depend on the new service being available.
    await mirrorSpringScan({ id: scan.id, shopId: shop.id, targetUrl: target.url, executionMode: body.profile === "DYNAMIC" ? "DYNAMIC" : "STATIC", viewport: body.viewport, purchasePath }, session!);
    await notifySpringScanStatus(scan.id, "queued");
    return Response.json({ scanId: scan.id, status: scan.status, createdAt: scan.createdAt }, { status: 202 });
  }

  const [resource, id, action] = route;
  if (resource === "scans" && id && action === "ai-review" && route.length === 3) {
    const limited = rateLimit(request, "ai-review", 10, 60 * 60 * 1000);
    if (limited) return limited;
    const scan = await db().scan.findFirst({
      where: { id, shop: { ownerHash }, status: { in: ["COMPLETED", "PARTIAL"] }, reportPath: { not: null } },
      select: { reportPath: true, shop: { select: { plan: true } }, aiReview: true },
    });
    if (!scan?.reportPath) return notFound();
    if (scan.shop?.plan !== "PREMIUM") return error("AI 정밀 분석은 유료 플랜에서 사용자가 별도로 요청할 수 있습니다.", 402);
    const report = await getReport(scan.reportPath);
    const candidates = ((report as unknown as { reviewCandidates?: unknown[] } | null)?.reviewCandidates ?? []);
    if (!candidates.length) return error("AI로 추가 분석할 검토 후보가 없습니다.", 409);
    if (scan.aiReview?.status === "QUEUED" || scan.aiReview?.status === "RUNNING" || scan.aiReview?.status === "COMPLETED") {
      return Response.json({ id: scan.aiReview.id, status: scan.aiReview.status }, { status: scan.aiReview.status === "COMPLETED" ? 200 : 202 });
    }
    const job = await db().aiReview.upsert({
      where: { scanId: id },
      create: { id: randomUUID(), scanId: id, status: "QUEUED", candidateCount: candidates.length },
      update: { status: "QUEUED", requestedAt: new Date(), startedAt: null, completedAt: null, resultJson: null, usageJson: null, error: null, candidateCount: candidates.length },
    });
    return Response.json({ id: job.id, status: job.status }, { status: 202 });
  }
  if (resource === "scans" && id && action === "ai-review-labels" && route.length === 3) {
    const scan = await db().scan.findFirst({ where: { id, shop: { ownerHash } }, select: { aiReview: true } });
    if (!scan?.aiReview) return notFound();
    const labels = body?.labels;
    if (!Array.isArray(labels) || labels.length > 40 || labels.some((item: unknown) => !item || typeof item !== "object" || typeof (item as { candidateId?: unknown }).candidateId !== "string" || !["LIKELY_RISK", "NEEDS_REVIEW", "LIKELY_BENIGN", "INSUFFICIENT_EVIDENCE"].includes((item as { label?: string }).label ?? ""))) {
      return error("후보 ID와 허용된 라벨이 필요합니다.", 400);
    }
    const saved = await db().aiReview.update({ where: { id: scan.aiReview.id }, data: { operatorLabelsJson: JSON.stringify(labels), labeledAt: new Date(), labelSource: "OPERATOR" } });
    return Response.json({ id: saved.id, status: saved.status, labeledAt: saved.labeledAt });
  }
  if (resource === "scans" && id && action === "cancel" && route.length === 3) {
    const where = { id, shop: { ownerHash } };
    const running = await db().scan.updateMany({
      where: { ...where, status: "RUNNING" }, data: { cancelRequested: true },
    });
    if (running.count) return Response.json({ status: "RUNNING", cancelRequested: true }, { status: 202 });
    const queued = await db().scan.updateMany({
      where: { ...where, status: "QUEUED" }, data: { status: "CANCELLED", credentialCiphertext: null },
    });
    if (queued.count) return Response.json({ status: "CANCELLED" });
    const scan = await db().scan.findFirst({ where, select: { status: true } });
    if (scan?.status === "RUNNING") {
      const changed = await db().scan.updateMany({
        where: { ...where, status: "RUNNING" }, data: { cancelRequested: true },
      });
      if (changed.count) return Response.json({ status: "RUNNING", cancelRequested: true }, { status: 202 });
    }
    return scan ? error("진단이 이미 종료됐습니다.", 409) : notFound();
  }
  return notFound();
}

export async function GET(request: NextRequest, context: Context) {
  const route = (await context.params).path;
  if (route.join("/") === "health") {
    try {
      await db().$queryRaw`SELECT 1`;
      const [queued, running, stale] = await Promise.all([
        db().scan.count({ where: { status: "QUEUED" } }),
        db().scan.count({ where: { status: "RUNNING" } }),
        db().scan.count({ where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 6 * 60 * 1000) } } }),
      ]);
      const healthy = stale === 0;
      return Response.json({
        status: healthy ? "ok" : "degraded", service: "baromi", version: process.env.APP_VERSION ?? "0.1.0",
        worker: { queued, running, stale },
      }, { status: healthy ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return error("데이터베이스를 사용할 수 없습니다.", 503);
    }
  }
  const session = request.cookies.get(cookie)?.value;
  if (!session) return notFound();
  const ownerHash = hash(session);
  const [resource, id, action, ...extra] = route;
  if (!id || extra.length) return notFound();

  if (resource === "shops" && action === "scans" && route.length === 3) {
    const shop = await db().shop.findFirst({ where: { id, ownerHash }, select: { id: true } });
    if (!shop) return notFound();
    const scans = await db().scan.findMany({
      where: { shopId: shop.id }, orderBy: { createdAt: "desc" }, take: 50,
      include: { findings: { select: { status: true } } },
    });
    return Response.json(scans.map((scan) => ({
      scanId: scan.id, status: scan.status, executionMode: scan.executionMode,
      viewport: scan.viewport, purchasePath: scan.purchasePath, createdAt: scan.createdAt,
      durationMs: scan.durationMs,
      summary: {
        suspected: scan.findings.filter((finding) => finding.status === "SUSPECTED").length,
        reviewNeeded: scan.findings.filter((finding) => finding.status === "REVIEW_NEEDED").length,
      },
    })));
  }
  if (resource === "shops" && !action) {
    const shop = await db().shop.findFirst({
      where: { id, ownerHash }, select: { id: true, url: true, consentAt: true, verifiedAt: true },
    });
    return shop ? Response.json(shop) : notFound();
  }
  if (resource === "findings" && !action && /^\d{1,9}$/.test(id)) {
    const finding = await db().finding.findFirst({ where: { id: Number(id), scan: { shop: { ownerHash } } } });
    if (!finding) return notFound();
    const scan = await db().scan.findUniqueOrThrow({ where: { id: finding.scanId }, include: { findings: { orderBy: { id: "asc" } } } });
    const report = await getReport(scan.reportPath);
    const detail = report?.findings[scan.findings.findIndex((item) => item.id === finding.id)];
    return detail ? Response.json({ id: finding.id, scanId: scan.id, ...detail }) : notFound();
  }
  if (resource === "evidences" && !action) {
    const scanId = id.slice(0, 36);
    const stage = stages.find((value) => id === scanId + "-" + value);
    if (!stage) return notFound();
    const scan = await db().scan.findFirst({ where: { id: scanId, shop: { ownerHash } } });
    const report = await getReport(scan?.reportPath ?? null);
    if (!report?.snapshots.some((snapshot) => snapshot.stage === stage)) return notFound();
    const png = await readFile(join(evidenceDirectory(scanId), stage + ".png")).catch(() => null);
    return png ? new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    }) : notFound();
  }
  if (resource !== "scans") return notFound();
  if (springAuthoritative() && (action === undefined || action === "report")) {
    let spring: Record<string, unknown> | null;
    try {
      spring = await readSpringScan(id, session, action === "report");
    } catch (cause) {
      return error(cause instanceof Error ? cause.message : "Spring 상태 저장소에 연결할 수 없습니다.", 503);
    }
    if (spring) {
      if (action === "report") {
        return Response.json({ ...spring, scanId: spring.scanId ?? id, source: "SPRING_POSTGRES" }, {
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      return Response.json({ ...spring, source: "SPRING_POSTGRES", progress: spring.status === "queued" || spring.status === "running" ? 0 : 100 }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  }
  const scan = await db().scan.findFirst({
    where: { id, shop: { ownerHash } }, include: { findings: { orderBy: { id: "asc" } }, aiReview: true, shop: { select: { plan: true } } },
  });
  if (!scan) return notFound();
  const active = ["QUEUED", "RUNNING"].includes(scan.status);
  const storedReport = !active && scan.reportPath ? await getReport(scan.reportPath).catch(() => null) : null;
  const observedStages = new Set(storedReport?.snapshots.map(({ stage }) => stage) ?? []);
  const requiredStages = scan.purchasePath === "DIRECT" ? new Set<Stage>(["product", "checkout"]) : new Set<Stage>(stages);
  const coverage = Object.fromEntries(stages.map((stage, index) => [stage,
    observedStages.has(stage) ? "COVERED"
      : !requiredStages.has(stage) ? "SKIPPED"
        : active ? (index < scan.progress ? "COVERED" : "PENDING") : "BLOCKED",
  ]));
  const progressStages = scan.purchasePath === "DIRECT" ? 2 : stages.length;
  const summary = {
    suspected: scan.findings.filter((finding) => finding.status === "SUSPECTED").length,
    reviewNeeded: scan.findings.filter((finding) => finding.status === "REVIEW_NEEDED").length,
    notTested: active ? 0 : [...requiredStages].filter((stage) => !observedStages.has(stage)).length,
  };
  const surfaceObservations = ((storedReport as unknown as { surfaceObservations?: { kind: DiagnosticSurfaceKind; outcome: string }[] } | null)?.surfaceObservations ?? []);
  const surfaceCoverage = Object.fromEntries(diagnosticSurfaceKinds.map((kind) => {
    if (scan.executionMode !== "DYNAMIC") return [kind, "SKIPPED"];
    if (active) return [kind, "PENDING"];
    const observations = surfaceObservations.filter((item) => item.kind === kind);
    return [kind, observations.some((item) => item.outcome === "OBSERVED") ? "COVERED"
      : observations.some((item) => item.outcome === "DISCOVERED") ? "DISCOVERED"
        : observations.length ? "BLOCKED" : "NOT_FOUND"];
  }));
  if (!action) {
    return Response.json({
      scanId: scan.id, shopId: scan.shopId, scenario: scan.scenario, executionMode: scan.executionMode, viewport: scan.viewport,
      durationMs: scan.durationMs,
      purchasePath: scan.purchasePath,
      status: scan.status, cancelRequested: scan.cancelRequested, currentStage: scan.currentStage,
      progress: active ? Math.round(Math.min(scan.progress, progressStages) * 100 / progressStages) : 100, coverage, surfaceCoverage, summary,
    });
  }
  if (action === "findings") return Response.json(scan.findings);
  if (action === "report" && scan.reportPath) {
    const report = storedReport ?? await getReport(scan.reportPath);
    const baseline = scan.baselineScanId ? await db().scan.findFirst({
      where: { id: scan.baselineScanId, shopId: scan.shopId, shop: { ownerHash } },
      select: { reportPath: true },
    }) : null;
    const before = await getReport(baseline?.reportPath ?? null).catch(() => null);
    const comparison = scan.baselineScanId && report
      ? { baselineScanId: scan.baselineScanId, ...(before ? compareScans(before, report)
        : { status: "UNAVAILABLE" as const, reason: "기준 보고서를 읽을 수 없습니다." }) }
      : null;
    const findings = report
      ? scan.findings.map((stored, index) => ({ ...(report.findings[index] ?? {}), id: stored.id, type: stored.type, status: stored.status, stage: stored.stage, reason: stored.reason, ruleVersion: stored.ruleVersion }))
      : scan.findings;
    const aiReview = scan.aiReview ? {
      id: scan.aiReview.id, status: scan.aiReview.status, requestedAt: scan.aiReview.requestedAt,
      completedAt: scan.aiReview.completedAt, provider: scan.aiReview.provider, model: scan.aiReview.model,
      candidateCount: scan.aiReview.candidateCount, durationMs: scan.aiReview.durationMs, error: scan.aiReview.error,
      result: scan.aiReview.resultJson ? JSON.parse(scan.aiReview.resultJson) : null,
      usage: scan.aiReview.usageJson ? JSON.parse(scan.aiReview.usageJson) : null,
      operatorLabels: scan.aiReview.operatorLabelsJson ? JSON.parse(scan.aiReview.operatorLabelsJson) : null,
    } : null;
    const response = Response.json({ ...report, viewport: scan.viewport, purchasePath: scan.purchasePath,
      durationMs: scan.durationMs,
      comparison, scanId: scan.id, shopId: scan.shopId, coverage, surfaceCoverage, summary,
      aiEligible: scan.shop?.plan === "PREMIUM", aiReview,
      findings });
    if (request.nextUrl.searchParams.get("download") === "1") {
      response.headers.set("Content-Disposition", `attachment; filename="baromi-${scan.id}.json"`);
    }
    return response;
  }
  return notFound();
}

export async function DELETE(request: NextRequest, context: Context) {
  const session = request.cookies.get(cookie)?.value;
  if (!session) return notFound();
  const ownerHash = hash(session);
  const route = await context.params;
  const [resource, id] = route.path;
  if (!id || route.path.length !== 2) return notFound();
  if (resource === "scans") {
    const scan = await db().scan.findFirst({ where: { id, shop: { ownerHash } }, select: { id: true, status: true } });
    if (!scan) return notFound();
    if (["QUEUED", "RUNNING"].includes(scan.status)) return error("진행 중인 진단은 먼저 중단해 주세요.", 409);
    await db().scan.delete({ where: { id: scan.id } });
    await rm(evidenceDirectory(scan.id), { recursive: true, force: true }).catch(() => undefined);
    return Response.json({ deleted: true, scanId: scan.id });
  }
  if (resource === "shops") {
    const shop = await db().shop.findFirst({ where: { id, ownerHash }, select: { id: true, scans: { select: { id: true, status: true } } } });
    if (!shop) return notFound();
    if (shop.scans.some((scan) => ["QUEUED", "RUNNING"].includes(scan.status))) return error("진행 중인 진단이 있어 상점을 삭제할 수 없습니다.", 409);
    await db().shop.delete({ where: { id: shop.id } });
    await Promise.all(shop.scans.map((scan) => rm(evidenceDirectory(scan.id), { recursive: true, force: true }).catch(() => undefined)));
    return Response.json({ deleted: true, shopId: shop.id });
  }
  return notFound();
}
