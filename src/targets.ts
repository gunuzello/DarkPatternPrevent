import { scenarios, type Scenario } from "./demo";

export const demoOrigin = () => process.env.DEMO_ORIGIN ?? "http://127.0.0.1:3000";

export function demoTarget(scenario: Scenario) {
  return new URL("/demo/" + scenario + "/product", demoOrigin()).href;
}

export function allowedScenario(url: unknown) {
  return scenarios.find((scenario) => demoTarget(scenario) === url);
}
