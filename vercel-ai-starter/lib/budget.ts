/**
 * Builds the BudgetGuard that hard-caps this agent's spend.
 *
 * The guard is LOCAL: it prices token usage offline (from floe-guard's bundled
 * cost map) and throws BudgetExceeded before the call that would cross the
 * ceiling. There is no network in the default path — the cap is on by default.
 *
 * One-env-var hosted upgrade: if FLOE_API_KEY is set, we make ONE read-only
 * call to Floe's credit API to learn the server-side remaining budget and use
 * it to *tighten* (never loosen) the local ceiling. This only READS remaining
 * budget — it is not server-side enforcement. Un-bypassable, cross-vendor
 * enforcement is the hosted Floe product; this starter ships the local guard.
 */

import { BudgetGuard } from "floe-guard";

/** Floe credit API — the ONLY Floe endpoint this starter talks to. */
const CREDIT_REMAINING_URL =
  "https://credit-api.floelabs.xyz/v1/agents/credit-remaining";

/** USDC has 6 decimals; the API returns base-unit integer strings. */
const USDC_DECIMALS = 1_000_000;

/** Default ceiling when FLOE_BUDGET_USD is unset or invalid. */
const DEFAULT_CAP_USD = 1.0;

/** Read the local cap from FLOE_BUDGET_USD, defaulting to $1.00. */
export function localCapUsd(): number {
  const raw = process.env.FLOE_BUDGET_USD;
  if (!raw) return DEFAULT_CAP_USD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAP_USD;
}

/**
 * Build the guard. Uses the local cap, tightened to the hosted remaining
 * budget when FLOE_API_KEY is present and the read succeeds.
 */
export async function buildGuard(): Promise<BudgetGuard> {
  const cap = localCapUsd();
  const hostedRemaining = await fetchHostedRemainingUsd();
  const limit =
    hostedRemaining !== null ? Math.min(cap, hostedRemaining) : cap;
  return new BudgetGuard(limit);
}

/**
 * Read the server-side remaining USD from Floe, or null on any failure.
 *
 * Uses the tighter of `headroomToAutoBorrow` (credit headroom) and
 * `sessionSpendRemaining` (per-session cap), both returned as USDC base-unit
 * strings. Fails safe: any error, timeout, non-OK status, or unparseable body
 * returns null so the caller falls back to the local cap. The key is never
 * logged or persisted.
 */
async function fetchHostedRemainingUsd(): Promise<number | null> {
  const key = process.env.FLOE_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(CREDIT_REMAINING_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    const candidates = [
      parseUsdc(data.headroomToAutoBorrow),
      parseUsdc(data.sessionSpendRemaining),
    ].filter((n): n is number => n !== null);

    return candidates.length > 0 ? Math.min(...candidates) : null;
  } catch {
    // Network error, timeout, abort, bad JSON — fall back to the local cap.
    return null;
  }
}

/**
 * Parse a USDC base-unit string into USD, or null if it isn't valid.
 *
 * Parses via BigInt: base-unit integer strings can exceed Number.MAX_SAFE_INTEGER,
 * and Number() would silently lose precision. Reject above the safe-integer
 * boundary rather than return a rounded value.
 */
function parseUsdc(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  try {
    const baseUnits = BigInt(value);
    if (baseUnits > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(baseUnits) / USDC_DECIMALS;
  } catch {
    return null;
  }
}
