import { Resolver } from "node:dns/promises";
import { get } from "node:https";
import { BlockList } from "node:net";
import { publicShopUrl } from "./targets";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(address, prefix, "ipv4");

export function publicAddress(addresses: string[]) {
  return addresses.length && addresses.every((address) => !blocked.check(address, "ipv4")) ? addresses[0] : null;
}

const maxBytes = 2 * 1024 * 1024;

function download(url: URL, address: string) {
  return new Promise<{ redirect: string } | { html: string }>((resolve, reject) => {
    // Dial the vetted address directly while keeping HTTPS certificate verification for the hostname.
    const request = get({
      hostname: address, servername: url.hostname, port: 443, agent: false,
      path: url.pathname + url.search, signal: AbortSignal.timeout(12_000),
      headers: { Host: url.host, Accept: "text/html,application/xhtml+xml", "User-Agent": "DarkPatternGuard/0.1" },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.destroy();
        resolve({ redirect: location });
        return;
      }
      const type = response.headers["content-type"] ?? "";
      if (status !== 200 || !/^(text\/html|application\/xhtml\+xml)\b/i.test(type) ||
          Number(response.headers["content-length"]) > maxBytes) {
        response.destroy();
        reject(new Error("공개 HTML 페이지를 읽을 수 없습니다."));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("error", reject);
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(new Error("HTML 크기 제한을 초과했습니다."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] ?? "utf-8";
          resolve({ html: new TextDecoder(charset).decode(Buffer.concat(chunks)) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
  });
}

export async function fetchPublicHtml(input: string) {
  let url = publicShopUrl(input);
  if (!url) throw new Error("공개 HTTPS 주소가 필요합니다.");
  const rootHost = url.hostname.replace(/^www\./, "");
  const dns = new Resolver({ timeout: 2500, tries: 1 });
  for (let attempt = 0; attempt < 4; attempt++) {
    const address = publicAddress(await dns.resolve4(url.hostname));
    if (!address) throw new Error("공개 IP로 연결할 수 없습니다.");
    const result = await download(url, address);
    if ("html" in result) return { url: url.href, html: result.html };
    url = publicShopUrl(new URL(result.redirect, url).href);
    if (!url || url.hostname.replace(/^www\./, "") !== rootHost) {
      throw new Error("다른 도메인으로 이동하는 주소입니다.");
    }
  }
  throw new Error("페이지 이동 제한을 초과했습니다.");
}
