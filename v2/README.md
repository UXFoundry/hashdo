# HashDo v2 — Actionable Cards for the AI Age

A universal framework for building **actionable cards** that work everywhere AI lives.
Write once, serve as MCP tools in ChatGPT, Claude, VS Code, or any MCP-compatible client.

## Architecture

```
v2/
├── packages/
│   ├── core/           # Card spec, types, renderer
│   ├── mcp-adapter/    # Turns cards into MCP tools (Zod schemas, stdio transport)
│   └── cli/            # CLI: serve (MCP), preview (HTTP), list
├── demo-cards/
│   ├── weather/        # Open-Meteo weather conditions
│   ├── stock-quote/    # Stock price with watchlist + alerts
│   └── qr-code/       # QR code generator
└── serve-demo.ts       # Entry point: all demo cards as one MCP server
```

## Quick Start

```bash
cd v2
npm install
npm run build

# Start MCP server (stdio) with demo cards
npx tsx serve-demo.ts

# Preview cards in browser
npx tsx packages/cli/src/cli.ts preview demo-cards
```

## Defining a Card

```typescript
import { defineCard } from '@hashdo/core';

export default defineCard({
  name: 'my-card',
  description: 'Used by LLMs to decide when to invoke this tool',

  inputs: {
    query: { type: 'string', required: true, description: 'Search query' },
  },

  async getData({ inputs, state }) {
    const results = await fetchSomething(inputs.query);
    return { viewModel: { results }, state: { lastQuery: inputs.query } };
  },

  actions: {
    save: {
      label: 'Save Result',
      async handler({ state }) {
        return { state: { ...state, saved: true }, message: 'Saved!' };
      },
    },
  },

  template: (vm) => `<div>${vm.results}</div>`,
});
```

Each card automatically becomes:
- An **MCP tool** (inputs → tool parameters, getData → handler, template → HTML response)
- **MCP actions** (each action → separate tool named `cardName__actionName`)

## MCP Integration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hashdo": {
      "command": "npx",
      "args": ["tsx", "/path/to/v2/serve-demo.ts"]
    }
  }
}
```

## Key Concepts

| HashDo Concept | MCP Equivalent | What It Does |
|----------------|----------------|--------------|
| Card inputs    | Tool parameters | Typed, validated parameters with descriptions |
| getData()      | Tool handler   | Server-side data fetching + business logic |
| Card template  | Tool response  | HTML rendered and returned as tool output |
| Card actions   | Additional tools | Named operations (book, save, alert, toggle) |
| Card state     | Persisted state | Survives across renders, enables conversations |
| Webhooks       | Push updates   | External events update card state |

## Packages

### @hashdo/core
- `defineCard()` — Type-safe card definition with full inference
- `renderCard()` — Render a card to HTML given inputs + state
- `MemoryStateStore` — In-memory state (swap for Redis/Postgres in production)
- Full TypeScript types for inputs, actions, state, webhooks

### @hashdo/mcp-adapter
- `serveMcp()` — Start an MCP stdio server from card definitions
- `createMcpCardServer()` — Create server programmatically
- Automatic Zod schema generation from card input definitions
- State management across tool invocations

### @hashdo/cli
- `hashdo serve [dir]` — Start MCP server exposing cards as tools
- `hashdo preview [dir]` — HTTP server for card development/preview
- `hashdo list [dir]` — List discovered cards with inputs/actions

## See Also

- [ACTIONABLE_CARDS_AI_PLAN.md](../ACTIONABLE_CARDS_AI_PLAN.md) — Full strategic plan and roadmap
