import { scenarios, type Scenario } from "./demo";

export const demoOrigin = () => process.env.DEMO_ORIGIN ?? "http://127.0.0.1:3000";

export function demoTarget(scenario: Scenario) {
  return new URL("/demo/" + scenario + "/product", demoOrigin()).href;
}

export function allowedScenario(url: unknown) {
  return scenarios.find((scenario) => demoTarget(scenario) === url);
}

export function publicShopUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z](?:[a-z0-9-]*[a-z0-9])?$/i.test(host) ||
        /\.(?:localhost|local|internal|invalid|test|example|onion|lan|home|arpa)$/i.test(host)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function scanTarget(value: unknown) {
  const scenario = allowedScenario(value);
  if (scenario) return { scenario, url: demoTarget(scenario) };
  const url = publicShopUrl(value);
  return url ? { scenario: "public" as const, url: url.href } : null;
}
