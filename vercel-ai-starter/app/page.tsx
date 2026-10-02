"use client";

import { useState } from "react";

interface DemoResult {
  ceilingUsd: number;
  spentUsd: number;
  remainingUsd: number;
  completedIterations: number;
  stoppedAtIteration: number | null;
  perIteration: Array<{ iteration: number; costUsd: number; cumulativeUsd: number }>;
  model: string;
  message: string;
}

export default function Home() {
  const [result, setResult] = useState<DemoResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDemo() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/demo");
      if (!res.ok) throw new Error(`Demo failed (HTTP ${res.status})`);
      setResult((await res.json()) as DemoResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>A governed AI agent.</h1>
      <p className="tagline">
        A Vercel AI SDK agent whose spend is hard-capped by{" "}
        <a href="https://github.com/Floe-Labs/floe-guard">floe-guard</a> out of the box.
        At 3 AM a runaway loop dies at your ceiling — not at $4,000.
      </p>

      <button type="button" className="button" onClick={runDemo} disabled={loading}>
        {loading ? "Running…" : "Watch the budget stop a runaway loop"}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="panel">
          <p className="summary">
            {result.stoppedAtIteration !== null ? (
              <>
                <span className="stopped">
                  Hard-stopped at iteration {result.stoppedAtIteration}.{" "}
                </span>
                Spent ${result.spentUsd} of the ${result.ceilingUsd} ceiling, then the next
                call was blocked. No API key, no account, no network.
              </>
            ) : (
              <>
                Ran {result.completedIterations} iterations and spent ${result.spentUsd} of
                the ${result.ceilingUsd} ceiling without hitting it. No API key, no account,
                no network.
              </>
            )}
          </p>
          <table>
            <thead>
              <tr>
                <th>Iteration</th>
                <th>Call cost</th>
                <th>Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {result.perIteration.map((row) => (
                <tr key={row.iteration}>
                  <td>{row.iteration}</td>
                  <td>${row.costUsd}</td>
                  <td>${row.cumulativeUsd}</td>
                </tr>
              ))}
              {result.stoppedAtIteration !== null && (
                <tr className="blocked-row">
                  <td>{result.stoppedAtIteration}</td>
                  <td colSpan={2}>BudgetExceeded — call blocked</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="links">
        Go live: add <code>OPENAI_API_KEY</code> and POST to <code>/api/chat</code>. See the{" "}
        <a href="https://github.com/Floe-Labs/floe-vercel-ai-starter#readme">README</a> for
        the deploy button and the optional one-env-var hosted upgrade.
      </p>
    </main>
  );
}
