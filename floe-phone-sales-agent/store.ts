/**
 * Dead-simple JSON store for call outcomes — no DB to stand up for a reference.
 * One file, keyed by callId. In production, swap this for your CRM/Postgres.
 *
 * Why a store at all: in webhook mode we see every utterance live, so we log the
 * transcript + disposition ourselves (Floe Phone doesn't yet push a structured
 * call-end/disposition event — the app routes around that here).
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Disposition =
  | "in_progress"
  | "demo_requested" // prospect agreed; we captured email/time. NOT a confirmed booking.
  | "booked_demo" // reserved: set only when a real scheduler/CRM confirms (not by this reference).
  | "interested"
  | "not_interested"
  | "callback"
  | "opt_out"
  | "no_answer";

export interface CallRecord {
  callId: string;
  leadId?: string;
  toNumber?: string;
  disposition: Disposition;
  transcript: { role: "caller" | "agent"; text: string; at: string }[];
  bookedSlot?: string;
  demoEmail?: string; // the email the prospect gave book_demo; matches the Calendly webhook
  startedAt: string;
  updatedAt: string;
}

const FILE = fileURLToPath(new URL("./calls.json", import.meta.url));

function load(): Record<string, CallRecord> {
  if (!existsSync(FILE)) return {}; // genuinely empty DB — the only case that yields {}
  // Surface a parse failure instead of returning {} — otherwise the next save()
  // would overwrite a merely-corrupted file and erase every call record.
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch (e) {
    throw new Error(`calls.json is unreadable (${(e as Error).message}). Refusing to continue and overwrite it — inspect/back it up first.`);
  }
}

// Atomic write: serialize to a temp file, then rename over the target. A partial
// write / crash leaves the old file intact rather than a truncated one.
function save(all: Record<string, CallRecord>): void {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, FILE);
}

export function getCall(callId: string): CallRecord {
  const all = load();
  if (!all[callId]) {
    const now = new Date().toISOString();
    all[callId] = { callId, disposition: "in_progress", transcript: [], startedAt: now, updatedAt: now };
    save(all);
  }
  return all[callId];
}

export function updateCall(callId: string, patch: Partial<CallRecord>): CallRecord {
  const all = load();
  const rec = all[callId] ?? getCall(callId);
  all[callId] = { ...rec, ...patch, transcript: patch.transcript ?? rec.transcript, updatedAt: new Date().toISOString() };
  save(all);
  return all[callId];
}

// A booking outcome must survive a later tool call — the model can call book_demo
// then mark_disposition, and naive last-write-wins would erase the booking. Once a
// booking exists, only a STRONGER booking (demo_requested → booked_demo, e.g. when
// the Calendly webhook confirms) or a compliance opt_out may replace it; a plain
// disposition can't clobber it.
const BOOKING_RANK: Partial<Record<Disposition, number>> = { demo_requested: 1, booked_demo: 2 };

export function applyDisposition(callId: string, next: Disposition, patch: Partial<CallRecord> = {}): CallRecord {
  const rec = getCall(callId);
  const curRank = BOOKING_RANK[rec.disposition] ?? 0;
  const nextRank = BOOKING_RANK[next] ?? 0;
  if (curRank > 0 && next !== "opt_out" && nextRank < curRank) {
    return rec; // preserve the (stronger-or-equal) booking; ignore the downgrade
  }
  return updateCall(callId, { ...patch, disposition: next });
}

// Most-recently-updated call for an email at a given disposition — the Calendly
// webhook uses this to find which call a booking confirms.
export function findLatestByEmail(email: string, disposition: Disposition): CallRecord | undefined {
  const wanted = email.trim().toLowerCase();
  return allCalls()
    .filter((c) => c.disposition === disposition && (c.demoEmail ?? "").trim().toLowerCase() === wanted)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function appendTurn(callId: string, role: "caller" | "agent", text: string): void {
  const rec = getCall(callId);
  rec.transcript.push({ role, text, at: new Date().toISOString() });
  updateCall(callId, { transcript: rec.transcript });
}

export function linkLead(callId: string, leadId: string, toNumber: string): void {
  updateCall(callId, { leadId, toNumber });
}

export function allCalls(): CallRecord[] {
  return Object.values(load());
}
