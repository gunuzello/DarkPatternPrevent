import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../src/db";
import { stages } from "../../../../src/demo";
import { evidenceDirectory } from "../../../../src/evidence-directory";
import { scanTarget, demoOrigin } from "../../../../src/targets";
import { compareScans } from "../../../../src/scan-comparison";
import type { scanDemo } from "../../../../src/scan";

type Context = { params: Promise<{ path: string[] }> };
type Report = Omit<Awaited<ReturnType<typeof scanDemo>>, "scenario"> & { scenario: string };
const cookie = "darkpattern-session";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const error = (message: string, status: number) => Response.json({ error: message }, { status });
const notFound = () => error("요청한 항목을 찾을 수 없습니다.", 404);

async function getReport(path: string | null): Promise<Report | null> {
  return path ? JSON.parse(await readFile(path, "utf8")) : null;
}

export async function POST(request: NextRequest, context: Context) {
  const route = (await context.params).path;
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return error("JSON 요청이 필요합니다.", 415);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(demoOrigin()).origin) return error("동일 출처 요청이 필요합니다.", 403);
  const body = await request.json().catch(() => null);
  const session = request.cookies.get(cookie)?.value;

  if (route.join("/") === "shops") {
    const target = scanTarget(body?.url);
    if (body?.consent !== true || !target) {
      return error("공개 HTTPS 쇼핑몰 URL과 검사 동의가 필요합니다.", 400);
    }
    const token = session ?? randomUUID();
    const shop = await db().shop.create({
      data: { id: randomUUID(), url: target.url, ownerHash: hash(token) },
    });
    const response = NextResponse.json({ shopId: shop.id, url: shop.url }, { status: 201 });
    if (!session) response.cookies.set(cookie, token, { httpOnly: true, sameSite: "strict", path: "/", secure: request.nextUrl.protocol === "https:" });
    return response;
  }

  if (!session) return notFound();
  const ownerHash = hash(session);
  if (route.join("/") === "scans" && typeof body?.shopId === "string") {
    const shop = await db().shop.findFirst({ where: { id: body.shopId, ownerHash } });
    if (!shop) return notFound();
    const target = scanTarget(shop.url);
    if (!target) return error("지원하는 쇼핑몰 주소가 아닙니다.", 400);
    if (body.profile !== "CONTEST" || body.viewport !== "DESKTOP" ||
        !Array.isArray(body.flows) || body.flows.length !== 1 || body.flows[0] !== "PURCHASE" ||
        body.productLimit !== 1) {
      return error("데스크톱 구매 흐름에서 상품 1개를 진단할 수 있습니다.", 400);
    }
    const baselineScanId = body.baselineScanId;
    if (baselineScanId !== undefined) {
      if (typeof baselineScanId !== "string") return error("기준 진단 ID를 확인해 주세요.", 400);
      const baseline = await db().scan.findFirst({
        where: {
          id: baselineScanId, shopId: shop.id, targetUrl: target.url, scenario: target.scenario,
          status: { in: ["COMPLETED", "PARTIAL"] }, reportPath: { not: null },
        },
        select: { id: true },
      });
      if (!baseline) return notFound();
    }
    const scan = await db().scan.create({
      data: { id: randomUUID(), shopId: shop.id, targetUrl: target.url, scenario: target.scenario, baselineScanId, status: "QUEUED" },
    });
    return Response.json({ scanId: scan.id, status: scan.status, createdAt: scan.createdAt }, { status: 202 });
  }

  const [resource, id, action] = route;
  if (resource === "scans" && id && action === "cancel" && route.length === 3) {
    const where = { id, shop: { ownerHash } };
    const running = await db().scan.updateMany({
      where: { ...where, status: "RUNNING" }, data: { cancelRequested: true },
    });
    if (running.count) return Response.json({ status: "RUNNING", cancelRequested: true }, { status: 202 });
    const queued = await db().scan.updateMany({
      where: { ...where, status: "QUEUED" }, data: { status: "CANCELLED" },
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
  const session = request.cookies.get(cookie)?.value;
  if (!session) return notFound();
  const ownerHash = hash(session);
  const [resource, id, action, ...extra] = (await context.params).path;
  if (!id || extra.length) return notFound();

  if (resource === "shops" && !action) {
    const shop = await db().shop.findFirst({
      where: { id, ownerHash }, select: { id: true, url: true, consentAt: true },
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
  const scan = await db().scan.findFirst({
    where: { id, shop: { ownerHash } }, include: { findings: { orderBy: { id: "asc" } } },
  });
  if (!scan) return notFound();
  const active = ["QUEUED", "RUNNING"].includes(scan.status);
  const coverage = Object.fromEntries(stages.map((stage, index) => [
    stage, index < scan.progress ? "COVERED" : active ? "PENDING" : "BLOCKED",
  ]));
  const summary = {
    suspected: scan.findings.filter((finding) => finding.status === "SUSPECTED").length,
    reviewNeeded: scan.findings.filter((finding) => finding.status === "REVIEW_NEEDED").length,
    notTested: active ? 0 : stages.length - scan.progress,
  };
  if (!action) {
    return Response.json({
      scanId: scan.id, shopId: scan.shopId, scenario: scan.scenario, status: scan.status, cancelRequested: scan.cancelRequested,
      progress: active ? Math.round(scan.progress * 100 / stages.length) : 100, coverage, summary,
    });
  }
  if (action === "findings") return Response.json(scan.findings);
  if (action === "report" && scan.reportPath) {
    const report = await getReport(scan.reportPath);
    const baseline = scan.baselineScanId ? await db().scan.findFirst({
      where: { id: scan.baselineScanId, shopId: scan.shopId, shop: { ownerHash } },
      select: { reportPath: true },
    }) : null;
    const before = await getReport(baseline?.reportPath ?? null).catch(() => null);
    const comparison = scan.baselineScanId && report
      ? { baselineScanId: scan.baselineScanId, ...(before ? compareScans(before, report)
        : { status: "UNAVAILABLE" as const, reason: "기준 보고서를 읽을 수 없습니다." }) }
      : null;
    return Response.json({ ...report, comparison, scanId: scan.id, shopId: scan.shopId, coverage, summary,
      findings: scan.findings });
  }
  return notFound();
}
