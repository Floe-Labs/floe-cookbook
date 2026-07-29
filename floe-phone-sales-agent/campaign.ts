/**
 * The dialer. Reads a lead list and places one outbound Floe Phone call per lead
 * (POST /v1/calls, agent key). The server (server.ts) handles each conversation
 * and logs the transcript + disposition; the campaign spend cap set in setup.ts
 * bounds the whole run.
 *
 *   npx tsx campaign.ts        # uses leads.json if present, else leads.example.json
 *
 * IMPORTANT: use only WARM / OPT-IN contacts. Outbound-sales compliance (DNC
 * scrubbing, consent, recording disclosure, calling hours) is intentionally OUT
 * of scope for this example — handle it before dialing cold.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { placeCall, getCallStatus, requireEnv } from "./floe.js";
import { linkLead } from "./store.js";

requireEnv();

interface Lead { id: string; name?: string; company?: string; phone: string; email?: string }

const src = existsSync(new URL("./leads.json", import.meta.url))
  ? new URL("./leads.json", import.meta.url)
  : new URL("./leads.example.json", import.meta.url);
const leads: Lead[] = JSON.parse(readFileSync(src, "utf-8"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DIAL_INTERVAL_MS = Number(process.env.DIAL_INTERVAL_MS) || 1500;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 3000;
// Cap the wait so one stuck/never-ending call can't hang the whole campaign.
const MAX_CALL_WAIT_MS = Number(process.env.MAX_CALL_WAIT_MS) || 8 * 60 * 1000;

// Truly one-at-a-time: block until the call ends (GET /v1/calls/:id → terminal)
// or the cap elapses, so conversations don't overlap. Transient poll errors are
// ignored and retried until the deadline.
async function waitForCallEnd(callId: string): Promise<"ended" | "timeout"> {
  const deadline = Date.now() + MAX_CALL_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      if ((await getCallStatus(callId)).terminal) return "ended";
    } catch { /* transient — keep polling until the cap */ }
  }
  return "timeout";
}

async function main() {
  console.log(`📞 Campaign — ${leads.length} leads (${src.pathname.split("/").pop()})`);
  console.log("   Reminder: warm / opt-in contacts only. One call at a time.\n");
  let placed = 0;
  for (const lead of leads) {
    let callId: string | undefined;
    try {
      const call = await placeCall(lead.phone);
      callId = call.callId;
      linkLead(callId, lead.id, lead.phone);
      placed++;
      console.log(`   → ${lead.phone} ${lead.company ? `(${lead.company})` : ""}: ${callId} [${call.status}]`);
    } catch (e) {
      console.error(`   ✗ ${lead.phone}: ${(e as Error).message}`);
    }
    // Wait for THIS call to finish before dialing the next one.
    if (callId) {
      const outcome = await waitForCallEnd(callId);
      if (outcome === "timeout") console.log(`     …still active after ${MAX_CALL_WAIT_MS / 1000}s — moving on (call keeps running).`);
    }
    await sleep(DIAL_INTERVAL_MS); // brief gap between calls
  }
  console.log(`\n${placed}/${leads.length} calls placed. Transcripts + outcomes are in calls.json.`);
  console.log("Run  npx tsx report.ts  when they're done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
