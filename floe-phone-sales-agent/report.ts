/**
 * Campaign report — dispositions + cost-per-booked-demo.
 * Outcomes come from calls.json (logged live by the server); spend comes from
 * the Floe ledger (per-number usage).
 *
 *   npx tsx report.ts
 */
import "dotenv/config";
import { allCalls } from "./store.js";
import { getUsage } from "./floe.js";

// Report over the SAME window as the ledger usage below, so cost-per-request is
// spend ÷ requests over one span (not 7d spend ÷ all-time requests).
const WINDOW_DAYS = 7;
const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
const calls = allCalls().filter((c) => Date.parse(c.startedAt) >= cutoff);
if (!calls.length) {
  console.log(`No calls in the last ${WINDOW_DAYS} days. Run  npx tsx call.ts  or  npx tsx campaign.ts  first.`);
  process.exit(0);
}

const by: Record<string, number> = {};
for (const c of calls) by[c.disposition] = (by[c.disposition] || 0) + 1;
const requested = by["demo_requested"] || 0;

console.log(`\n📊 Sales campaign report — ${calls.length} calls (last ${WINDOW_DAYS} days)\n`);
console.log("   Dispositions:");
for (const [d, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${d.padEnd(16)} ${n}`);
}
console.log(`\n   Demo requests: ${requested}  (${((requested / calls.length) * 100).toFixed(0)}% of calls)`);

const agentId = process.env.FLOE_AGENT_ID;
const numberId = process.env.FLOE_NUMBER_ID;
if (agentId && numberId) {
  try {
    const usage = await getUsage(agentId, Number(numberId), WINDOW_DAYS);
    const total = Number(usage.totalRaw || 0) / 1e6;
    console.log(`\n   Floe spend (${WINDOW_DAYS}d, from the ledger): $${total.toFixed(4)}`);
    if (requested) console.log(`   Cost per demo request:            $${(total / requested).toFixed(4)}`);
  } catch (e) {
    console.log(`\n   (ledger usage unavailable: ${(e as Error).message})`);
  }
} else {
  console.log(`\n   Tip: set FLOE_NUMBER_ID (printed by setup.ts) to see spend + cost-per-demo from the ledger.`);
}
console.log(`\n   Full transcripts + outcomes: calls.json\n`);
