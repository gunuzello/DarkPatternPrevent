export type AiUsage = {
  provider: string;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

function rate(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Cost accounting is explicit and disabled by default: no model call means
 * an empty usage list and zero cost, which is also what reports persist. */
export function estimateAiUsage(input: Omit<AiUsage, "estimatedCostUsd">): AiUsage {
  const inputPerMillion = rate("BAROMI_AI_INPUT_USD_PER_MILLION", 0);
  const outputPerMillion = rate("BAROMI_AI_OUTPUT_USD_PER_MILLION", 0);
  const estimatedCostUsd = Number(((input.inputTokens / 1_000_000) * inputPerMillion + (input.outputTokens / 1_000_000) * outputPerMillion).toFixed(8));
  return { ...input, estimatedCostUsd };
}

export function summarizeAiUsage(items: AiUsage[]) {
  return {
    calls: items.length,
    inputTokens: items.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: items.reduce((sum, item) => sum + item.outputTokens, 0),
    estimatedCostUsd: Number(items.reduce((sum, item) => sum + item.estimatedCostUsd, 0).toFixed(8)),
    items,
  };
}

export function exceedsAiCostCap(usage: AiUsage, configuredCap = process.env.BAROMI_AI_MAX_COST_USD) {
  const cap = Number(configuredCap);
  return Number.isFinite(cap) && cap >= 0 && usage.estimatedCostUsd > cap;
}
