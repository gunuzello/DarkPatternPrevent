import { Resolver } from "node:dns/promises";
import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import { publicAddress } from "./public-html";

type ResolveHost = (hostname: string) => Promise<string[]>;

const hostnamePattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/i;

export async function safeConnectTarget(authority: string, resolveHost: ResolveHost) {
  let url: URL;
  try { url = new URL("https://" + authority); } catch { throw new Error("잘못된 브라우저 연결 주소입니다."); }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      url.port && url.port !== "443" || !hostnamePattern.test(url.hostname)) {
    throw new Error("허용되지 않은 브라우저 연결 주소입니다.");
  }
  const addresses = await resolveHost(url.hostname);
  const address = publicAddress(addresses);
  if (!address) throw new Error("공개 IP로 확인되지 않은 브라우저 연결입니다.");
  return { hostname: url.hostname, address, port: 443 } as const;
}

async function systemResolve(hostname: string) {
  const dns = new Resolver({ timeout: 2500, tries: 1 });
  const records = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
  return records.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export type SafeBrowserProxy = { server: string; close: () => Promise<void> };

export async function startSafeBrowserProxy(resolveHost: ResolveHost = systemResolve): Promise<SafeBrowserProxy> {
  const sockets = new Set<ReturnType<typeof connect>>();
  const server: Server = createServer((_request, response) => {
    response.writeHead(405, { Connection: "close" }).end();
  });
  server.on("connect", (request, client, head) => {
    void safeConnectTarget(request.url ?? "", resolveHost).then((target) => {
      if (sockets.size >= 64) throw new Error("동시 브라우저 연결 제한을 초과했습니다.");
      const upstream = connect({ host: target.address, port: target.port });
      sockets.add(upstream);
      upstream.setTimeout(15_000, () => upstream.destroy());
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
      upstream.once("close", () => sockets.delete(upstream));
      upstream.once("error", () => client.destroy());
      client.once("error", () => upstream.destroy());
      client.once("close", () => upstream.destroy());
    }).catch(() => client.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("안전 브라우저 중계를 시작하지 못했습니다.");
  return {
    server: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      for (const socket of sockets) socket.destroy();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
