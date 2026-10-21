/**
 * Live chat: streamText through a floe-guard-wrapped gpt-4o.
 *
 * Requires OPENAI_API_KEY. The same BudgetGuard that powers the zero-key demo
 * sits in the call path here, so a real agent's spend is hard-capped (default
 * $1.00, or FLOE_BUDGET_USD). The guard throws BudgetExceeded before the call
 * that would cross the ceiling — surfaced as an error in the stream.
 *
 * Body: { "messages": [{ "role": "user", "content": "hello" }] }
 */

import { openai } from "@ai-sdk/openai";
import { streamText, wrapLanguageModel, type CoreMessage } from "ai";
import { budgetGuardMiddleware } from "floe-guard";

import { buildGuard } from "@/lib/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        error: "missing_openai_key",
        detail:
          "Set OPENAI_API_KEY to enable live chat. The zero-key demo at /api/demo needs no key.",
      },
      { status: 400 },
    );
  }

  let messages: CoreMessage[];
  try {
    const body = (await req.json()) as { messages?: CoreMessage[] };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json(
        { error: "bad_request", detail: "Body must include a non-empty `messages` array." },
        { status: 400 },
      );
    }
    // Validate shape at the boundary so malformed payloads fail as a 400 here,
    // not as a 500 inside streamText. Each message needs a string `role` and
    // present `content` (a string or the array form for multi-part content).
    const allValid = body.messages.every(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as { role?: unknown }).role === "string" &&
        (typeof (m as { content?: unknown }).content === "string" ||
          Array.isArray((m as { content?: unknown }).content)),
    );
    if (!allValid) {
      return Response.json(
        {
          error: "bad_request",
          detail: "Each message needs a string `role` and `content` (string or array).",
        },
        { status: 400 },
      );
    }
    messages = body.messages;
  } catch {
    return Response.json(
      { error: "bad_request", detail: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const guard = await buildGuard();
  const model = wrapLanguageModel({
    model: openai("gpt-4o"),
    middleware: budgetGuardMiddleware(guard),
  });

  const result = streamText({ model, messages });
  return result.toDataStreamResponse();
}
