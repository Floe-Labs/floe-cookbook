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
import { placeCall, requireEnv } from "./floe.js";
import { linkLead } from "./store.js";

requireEnv();

interface Lead { id: string; name?: string; company?: string; phone: string; email?: string }

const src = existsSync(new URL("./leads.json", import.meta.url))
  ? new URL("./leads.json", import.meta.url)
  : new URL("./leads.example.json", import.meta.url);
const leads: Lead[] = JSON.parse(readFileSync(src, "utf-8"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`📞 Campaign — ${leads.length} leads (${src.pathname.split("/").pop()})`);
  console.log("   Reminder: warm / opt-in contacts only.\n");
  let placed = 0;
  for (const lead of leads) {
    try {
      const { callId, status } = await placeCall(lead.phone);
      linkLead(callId, lead.id, lead.phone);
      placed++;
      console.log(`   → ${lead.phone} ${lead.company ? `(${lead.company})` : ""}: ${callId} [${status}]`);
    } catch (e) {
      console.error(`   ✗ ${lead.phone}: ${(e as Error).message}`);
    }
    await sleep(1500); // one at a time, gently — the server + budget do the real work
  }
  console.log(`\n${placed}/${leads.length} calls placed. Transcripts + outcomes stream into calls.json as they run.`);
  console.log("Run  npx tsx report.ts  when they're done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
