/**
 * Dead-simple JSON store for call outcomes — no DB to stand up for a reference.
 * One file, keyed by callId. In production, swap this for your CRM/Postgres.
 *
 * Why a store at all: in webhook mode we see every utterance live, so we log the
 * transcript + disposition ourselves (Floe Phone doesn't yet push a structured
 * call-end/disposition event — the app routes around that here).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Disposition =
  | "in_progress"
  | "booked_demo"
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
  startedAt: string;
  updatedAt: string;
}

const FILE = fileURLToPath(new URL("./calls.json", import.meta.url));

function load(): Record<string, CallRecord> {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch {
    return {};
  }
}

function save(all: Record<string, CallRecord>): void {
  writeFileSync(FILE, JSON.stringify(all, null, 2));
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
