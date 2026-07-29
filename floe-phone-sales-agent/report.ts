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

const calls = allCalls();
if (!calls.length) {
  console.log("No calls yet. Run  npx tsx call.ts  or  npx tsx campaign.ts  first.");
  process.exit(0);
}

const by: Record<string, number> = {};
for (const c of calls) by[c.disposition] = (by[c.disposition] || 0) + 1;
const booked = by["booked_demo"] || 0;

console.log(`\n📊 Sales campaign report — ${calls.length} calls\n`);
console.log("   Dispositions:");
for (const [d, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${d.padEnd(16)} ${n}`);
}
console.log(`\n   Booked demos: ${booked}  (${((booked / calls.length) * 100).toFixed(0)}% of calls)`);

const agentId = process.env.FLOE_AGENT_ID;
const numberId = process.env.FLOE_NUMBER_ID;
if (agentId && numberId) {
  try {
    const usage = await getUsage(agentId, Number(numberId), 7);
    const total = Number(usage.totalRaw || 0) / 1e6;
    console.log(`\n   Floe spend (7d, from the ledger): $${total.toFixed(4)}`);
    if (booked) console.log(`   Cost per booked demo:            $${(total / booked).toFixed(4)}`);
  } catch (e) {
    console.log(`\n   (ledger usage unavailable: ${(e as Error).message})`);
  }
} else {
  console.log(`\n   Tip: set FLOE_NUMBER_ID (printed by setup.ts) to see spend + cost-per-demo from the ledger.`);
}
console.log(`\n   Full transcripts + outcomes: calls.json\n`);
