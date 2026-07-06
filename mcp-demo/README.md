# MCP Demo

Connect Claude Desktop (or Cursor) to Floe in one line. Zero install — Claude
talks to Floe's hosted MCP server.

## What it demonstrates

- A zero-install MCP connection to Floe's hosted server at `mcp.floelabs.xyz`.
- Reading markets, creating intents, managing loans, and building transactions
  as MCP tools.
- No API key needed for read-only tools.

## Stack

| | |
|---|---|
| Language | Config only (JSON) |
| Framework | Claude Desktop / Cursor (MCP) |
| Floe surface | Hosted MCP server |

## Prerequisites

- Claude Desktop or Cursor
- (Optional) A Floe API key for write tools — [get one at the dashboard](https://dev-dashboard.floelabs.xyz)

## Run

Copy `claude-config.json` into your Claude Desktop config, then restart Claude:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Then ask Claude:

- "What lending markets does Floe have?"
- "What's the current flash loan fee?"
- "Show me open lend intents for USDC/WETH"

## Learn more

- [Floe docs](https://floe-labs.gitbook.io/docs)
- [Floe MCP server](https://github.com/Floe-Labs/floe-mcp-server)
- [Model Context Protocol](https://modelcontextprotocol.io)
