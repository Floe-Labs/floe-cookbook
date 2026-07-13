# MCP Demo

Connect Claude Desktop or Cursor to Floe's hosted MCP server — no local server,
no database, no RPC setup.

## What it demonstrates

- An MCP connection to Floe's hosted server at `mcp.floelabs.xyz`.
- Reading markets, creating intents, managing loans, and building transactions
  as MCP tools.
- Your `floe_*` agent key authenticates the session; write tools return unsigned
  transactions for your wallet to sign.

## Stack

| | |
|---|---|
| Language | Config only (JSON) |
| Framework | Claude Desktop / Cursor (MCP) |
| Floe surface | Hosted MCP server |

## Prerequisites

- Claude Desktop or Cursor
- Node.js 18+ — Claude Desktop reaches the hosted endpoint through `npx mcp-remote`
- A Floe **agent key** (`floe_*`) — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)

## Run

Claude Desktop's config file is **stdio-only**, so it can't point at a remote URL
directly — this config bridges the hosted HTTP endpoint through
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote).

1. In `claude-config.json`, replace `floe_YOUR_AGENT_KEY` with your `floe_*` key.
2. Copy it into your Claude Desktop config, then restart Claude:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

> **Cursor** reaches the same endpoint natively — no `mcp-remote` needed. Add a
> `floe` entry to `.cursor/mcp.json` with `"url": "https://mcp.floelabs.xyz/mcp"`
> and an `Authorization: Bearer floe_…` header. See the
> [MCP server docs](https://floe-labs.gitbook.io/docs/developers/mcp-server).

Then ask Claude:

- "What lending markets does Floe have?"
- "What's the current flash loan fee?"
- "Show me open lend intents for USDC/WETH"

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs)
- [Floe MCP server](https://github.com/Floe-Labs/floe-mcp-server)
- [Model Context Protocol](https://modelcontextprotocol.io)
