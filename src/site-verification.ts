import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const verificationName = "baromi-site-verification";

export function createSiteVerification() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function attributes(tag: string) {
  return Object.fromEntries([...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? ""]));
}

export function verificationTokenInHtml(html: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs.name?.toLowerCase() === verificationName) return attrs.content ?? null;
  }
  return null;
}

export function matchesVerification(html: string, expectedHash: string) {
  const token = verificationTokenInHtml(html);
  if (!token || token.length > 256 || !/^[A-Za-z0-9_-]+$/.test(token)) return false;
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
