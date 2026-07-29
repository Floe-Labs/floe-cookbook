/**
 * Thin Floe client for the sales agent.
 *
 * Everything the agent spends — the in-call model, the paid research tool, the
 * phone legs — meters on ONE Floe balance under ONE set of spend controls.
 * Every LLM/tool call carries `X-Floe-Task-Id: <callId>` so a single task budget
 * (and the ledger) aggregates the whole call.
 *
 * Two keys, two surfaces (see floe-phone.md):
 *   - developer key (floe_live_…): provisioning — buy a number, set voice config.
 *   - agent key (floe_…): place calls + the in-call model/tool spend.
 */
import "dotenv/config";

const BASE = process.env.FLOE_CREDIT_API || "https://credit-api.floelabs.xyz";
const AGENT_KEY = process.env.FLOE_API_KEY || "";
const DEV_KEY = process.env.FLOE_LIVE_KEY || "";

export const MODEL = process.env.FLOE_MODEL || "openai/gpt-4o-mini";

/** Budget advisory the proxy/gateway stamps on paid responses (flag-gated JSON). */
export interface BudgetAdvisory {
  near_limit?: boolean;
  tightest?: { scope?: string; used_bps?: number; remaining_raw?: string };
}

function readCostHeaders(res: Response): { costUsd: number | null; advisory: BudgetAdvisory | null } {
  const cost = res.headers.get("X-Floe-Cost-USDC");
  let advisory: BudgetAdvisory | null = null;
  const adv = res.headers.get("X-Floe-Budget-Advisory");
  if (adv) {
    try {
      advisory = JSON.parse(adv) as BudgetAdvisory;
    } catch {
      advisory = null;
    }
  }
  return { costUsd: cost ? Number(cost) : null, advisory };
}

// ── Keyless LLM (the sales brain) ────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

export interface ChatResult {
  message: any; // the assistant message (may contain tool_calls)
  costUsd: number | null;
  advisory: BudgetAdvisory | null;
  blocked: boolean; // 402/403 — budget/policy denial
}

/** One turn of the model, through Floe Inference (no provider account needed). */
export async function keylessChat(messages: ChatMessage[], tools: unknown[], taskId: string): Promise<ChatResult> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AGENT_KEY}`,
      "Content-Type": "application/json",
      "X-Floe-Task-Id": taskId,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
      max_tokens: 220, // short — this is a phone call, not an essay
      temperature: 0.5,
    }),
  });
  const { costUsd, advisory } = readCostHeaders(res);
  if (res.status === 402 || res.status === 403) {
    return { message: { role: "assistant", content: "" }, costUsd, advisory, blocked: true };
  }
  if (!res.ok) throw new Error(`keylessChat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json: any = await res.json();
  return { message: json.choices?.[0]?.message ?? { role: "assistant", content: "" }, costUsd, advisory, blocked: false };
}

// ── x402 proxy (the one real paid tool: research a prospect via Exa) ──────────

export interface ProxyResult {
  ok: boolean;
  status: number;
  body: string;
  costUsd: number | null;
  advisory: BudgetAdvisory | null;
  blocked: boolean;
}

export async function proxyFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  taskId: string,
): Promise<ProxyResult> {
  const res = await fetch(`${BASE}/v1/proxy/fetch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AGENT_KEY}`,
      "Content-Type": "application/json",
      "X-Floe-Task-Id": taskId,
    },
    body: JSON.stringify({ url, method: init.method ?? "GET", headers: init.headers, body: init.body }),
  });
  const { costUsd, advisory } = readCostHeaders(res);
  const body = await res.text();
  return { ok: res.ok, status: res.status, body, costUsd, advisory, blocked: res.status === 402 || res.status === 403 };
}

// ── Provisioning (developer key) ─────────────────────────────────────────────

export async function ensureNumber(agentId: string, areaCode?: string): Promise<{ id: number; phoneNumber: string }> {
  // Buy one; if the agent already has a number, list and reuse it.
  const buy = await fetch(`${BASE}/v1/developer/agents/${agentId}/numbers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DEV_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(areaCode ? { areaCode } : {}),
  });
  if (buy.ok) return (await buy.json()).number;
  if (buy.status === 409) {
    const list = await fetch(`${BASE}/v1/developer/agents/${agentId}/numbers`, {
      headers: { Authorization: `Bearer ${DEV_KEY}` },
    });
    if (!list.ok) throw new Error(`ensureNumber list ${list.status}: ${(await list.text()).slice(0, 200)}`);
    const active = (await list.json()).numbers?.find((n: any) => n.status === "active");
    if (active) return active;
  }
  throw new Error(`ensureNumber ${buy.status}: ${(await buy.text()).slice(0, 200)}`);
}

export async function setVoiceConfig(
  agentId: string,
  cfg: { voiceMode: "webhook" | "hosted"; webhookUrl?: string; beginMessage?: string; voice?: string },
): Promise<void> {
  const res = await fetch(`${BASE}/v1/developer/agents/${agentId}/voice`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${DEV_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error(`setVoiceConfig ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ── Spend cap for the whole campaign (agent key) ─────────────────────────────

export async function setSessionLimit(limitRaw: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/agents/spend-limit`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${AGENT_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limitRaw }),
  });
  if (!res.ok) throw new Error(`setSessionLimit ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// ── Outbound call (agent key) ────────────────────────────────────────────────

export async function placeCall(toNumber: string): Promise<{ callId: string; from: string; to: string; status: string }> {
  const res = await fetch(`${BASE}/v1/calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AGENT_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ toNumber }),
  });
  if (!res.ok) throw new Error(`placeCall ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ── Per-number usage, straight from the Floe ledger (developer key) ──────────

export async function getUsage(agentId: string, numberId: number, days = 30): Promise<any> {
  const res = await fetch(`${BASE}/v1/developer/agents/${agentId}/numbers/${numberId}/usage?days=${days}`, {
    headers: { Authorization: `Bearer ${DEV_KEY}` },
  });
  if (!res.ok) throw new Error(`getUsage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export function requireEnv(): void {
  const missing = ["FLOE_API_KEY", "FLOE_AGENT_ID"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(", ")} — copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}
