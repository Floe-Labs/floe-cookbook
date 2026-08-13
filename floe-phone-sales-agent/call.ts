/**
 * Single outbound call — the "the agent calls you" test.
 *
 *   npx tsx call.ts +14155551234       # or set TARGET_PHONE_NUMBER in .env
 *
 * Answer the phone: the agent opens with the greeting from setup.ts and pitches
 * Floe. The whole call (telephony + STT + LLM + TTS + any lookup) meters on your
 * one Floe key, under the campaign cap. Transcript + outcome land in calls.json.
 */
import "dotenv/config";
import { placeCall, createTaskPolicy, requireEnv } from "./floe.js";
import { linkLead } from "./store.js";

requireEnv();

const to = process.argv[2] || process.env.TARGET_PHONE_NUMBER;
if (!to) {
  console.error("Usage: npx tsx call.ts +1XXXXXXXXXX   (or set TARGET_PHONE_NUMBER in .env)");
  process.exit(1);
}

// Per-call task cap in USDC base units (default $0.50). Empty string disables.
const PER_CALL_TASK_CAP_RAW = process.env.PER_CALL_TASK_CAP_RAW ?? "500000";

const { callId, from, status } = await placeCall(to);
linkLead(callId, "test", to);
// Enforce (not just attribute) this call's X-Floe-Task-Id budget with a task
// policy. Non-fatal: the campaign session cap still bounds spend.
if (PER_CALL_TASK_CAP_RAW) {
  try {
    await createTaskPolicy(callId.toLowerCase(), PER_CALL_TASK_CAP_RAW);
  } catch (e) {
    console.warn(`⚠ per-call cap not set: ${(e as Error).message}`);
  }
}
console.log(`📞 Calling ${to} from ${from} — callId ${callId} [${status}]`);
console.log("   Answer it; the agent pitches Floe. Run  npx tsx report.ts  after.");
