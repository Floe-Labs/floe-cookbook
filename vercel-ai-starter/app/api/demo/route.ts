/**
 * Zero-key demo: a runaway loop hard-stopped at a $0.10 ceiling.
 *
 * No API key, no account, no network. We point the AI SDK's official mock model
 * (`MockLanguageModelV1` from `ai/test`) at a fixed token usage, wrap it with
 * floe-guard's middleware, and loop `generateText` until the guard throws
 * `BudgetExceeded` — the same hard-stop that protects a real agent, shown
 * entirely offline. This is the floe-guard `runaway_loop` example ported to the
 * Vercel AI SDK.
 */

import { generateText, wrapLanguageModel } from "ai";
import { MockLanguageModelV1 } from "ai/test";
import { BudgetExceeded, BudgetGuard, budgetGuardMiddleware } from "floe-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Demo ceiling, in USD. */
const CEILING_USD = 0.1;
/** Hard cap on iterations so the loop always terminates even if pricing changes. */
const MAX_ITERATIONS = 100;
/** Fixed token usage per mock call (priced offline as gpt-4o by floe-guard). */
const USAGE = { promptTokens: 1000, completionTokens: 1000 };

export async function GET() {
  const guard = new BudgetGuard(CEILING_USD);

  // The mock model returns a fixed, priceable result every call — no network.
  // `modelId: "gpt-4o"` makes floe-guard price it from its bundled cost map.
  const model = wrapLanguageModel({
    model: new MockLanguageModelV1({
      modelId: "gpt-4o",
      doGenerate: async () => ({
        finishReason: "stop",
        usage: USAGE,
        text: "tool result: still looping...",
        rawCall: { rawPrompt: null, rawSettings: {} },
      }),
    }),
    middleware: budgetGuardMiddleware(guard),
  });

  const perIteration: Array<{
    iteration: number;
    costUsd: number;
    cumulativeUsd: number;
  }> = [];
  let stoppedAtIteration: number | null = null;
  let previousSpend = 0;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    try {
      await generateText({ model, prompt: "Keep working on the task." });
      const costUsd = guard.spentUsd - previousSpend;
      previousSpend = guard.spentUsd;
      perIteration.push({
        iteration,
        costUsd: round(costUsd),
        cumulativeUsd: round(guard.spentUsd),
      });
    } catch (err) {
      if (err instanceof BudgetExceeded) {
        stoppedAtIteration = iteration;
        break;
      }
      throw err;
    }
  }

  return Response.json({
    ceilingUsd: CEILING_USD,
    spentUsd: round(guard.spentUsd),
    remainingUsd: round(guard.remainingUsd),
    completedIterations: perIteration.length,
    stoppedAtIteration,
    perIteration,
    model: "gpt-4o (mocked offline — no network, no key)",
    message:
      stoppedAtIteration === null
        ? `Loop ran ${perIteration.length} iterations without hitting the ceiling.`
        : `floe-guard hard-stopped the runaway loop at iteration ${stoppedAtIteration}: ` +
          `$${round(guard.spentUsd)} of the $${CEILING_USD} ceiling was spent before the next ` +
          `call was blocked. No API key, no account, no network.`,
  });
}

/** Round to 6 decimal places (sub-cent precision) for readable JSON. */
function round(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}
