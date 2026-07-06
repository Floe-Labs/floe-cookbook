# openai-agents (Preview)

Floe + the **OpenAI Agents SDK**.

> **Status: `Preview`.** A native `floe-agent` adapter for the OpenAI Agents SDK
> is on the way. Until it ships, the supported integration path is **MCP
> fallback** — the OpenAI Agents SDK speaks MCP and connects directly to
> [`@floelabs/mcp-server`](https://github.com/Floe-Labs/floe-mcp-server).

## What it demonstrates

- Using Floe from the OpenAI Agents SDK today, via MCP fallback.
- Giving an OpenAI agent access to Floe's wallet, secured working capital, x402
  preflight, and credit-threshold tools over MCP.

## Stack

| | |
|---|---|
| Language | Config only (JSON) |
| Framework | OpenAI Agents SDK |
| Floe surface | Hosted MCP server |

## Prerequisites

- The OpenAI Agents SDK
- A Floe API key — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)

## Run

Add the Floe MCP server to your OpenAI Agents config:

```json
{
  "mcpServers": {
    "floe": {
      "url": "https://mcp.floelabs.xyz/mcp",
      "headers": {
        "Authorization": "Bearer floe_live_YOUR_API_KEY"
      }
    }
  }
}
```

Your OpenAI agent now has access to Floe's MCP tools — wallet, secured working
capital, x402 preflight, and credit thresholds.

A runnable script will land here once the native adapter is published. To get
notified, email [hello@floelabs.xyz](mailto:hello@floelabs.xyz) or follow
[@FloeLabs](https://x.com/FloeLabs).

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs)
- [Floe MCP server](https://github.com/Floe-Labs/floe-mcp-server)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
