# HashDo v2 — Actionable Cards for the AI Age

A universal framework for building **actionable cards** that work everywhere AI lives.
Write once, serve as MCP tools in ChatGPT, Claude, VS Code, or any MCP-compatible client.

## Architecture

```
v2/
├── packages/
│   ├── core/           # Card spec, types, renderer
│   ├── mcp-adapter/    # MCP server with Apps widget support
│   ├── screenshot/     # HTML → PNG via Puppeteer
│   └── cli/            # HTTP server, card discovery, dev tools
├── demo-cards/
│   ├── weather/        # do-weather — current conditions + auto-location
│   ├── stock-quote/    # do-stock — stock price + daily change
│   ├── crypto-quote/   # do-crypto — crypto price + market cap
│   ├── qr-code/        # do-qr — QR code generator
│   ├── city-explorer/  # do-city — city info mashup
│   └── poll/           # do-poll — interactive poll with live voting
├── serve-demo.ts       # Standalone MCP stdio server
└── Dockerfile          # Production image (Node 20 + Chromium)
```

## Quick Start

```bash
cd v2
npm install
npm run build

# Start MCP server (stdio) with demo cards
npx tsx serve-demo.ts

# Start HTTP server with web UI, API, and MCP endpoint
node packages/cli/dist/cli.js start demo-cards
```

## Defining a Card

```typescript
import { defineCard } from '@hashdo/core';

export default defineCard({
  name: 'do-example',
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

**Claude Desktop** — add to `claude_desktop_config.json`:

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

## Card Instances

Every card render produces an **instance** — identified by a short, deterministic, URL-safe `instanceId`. Same card + same inputs = same instance.

```
card inputs → instanceId (6-char hex) → state store key → persisted state
```

- **`instanceId`** is computed from `stateKey(inputs)` or a hash of all inputs. It's always user-independent.
- **`cardKey`** is the full state-store key: `card:{name}:{stateKey || hash}`. May include `userId` for per-user state.
- **Share URL**: `/share/{cardName}/{instanceId}` — loads the instance with its persisted state.

### Instance Modes

**Deterministic** (default) — same inputs always map to the same instance. Good for lookup cards:
```typescript
// Weather for "Tokyo" is always the same instance
defineCard({ name: 'do-weather', inputs: { city: { ... } } })
```

**Unique** (`uniqueInstance: true`) — every invocation without an explicit `id` creates a new instance. Good for creation cards:
```typescript
// Each poll is unique, even with the same question
defineCard({
  name: 'do-poll',
  uniqueInstance: true,
  inputs: { id: { type: 'string', required: false }, question: { ... } },
  stateKey: (inputs) => inputs.id ? `id:${inputs.id}` : undefined,
})
```

**Per-user** — use `userId` in `stateKey` to isolate state per user within the same instance:
```typescript
stateKey: (_inputs, userId) => userId ? `user:${userId}` : undefined
```

## Packages

### @hashdo/core
- `defineCard()` — Type-safe card definition with full inference
- `renderCard()` — Render a card to HTML given inputs + state (returns `instanceId` alongside html/state/viewModel)
- `resolveInstance()` — Compute `{ instanceId, cardKey }` from card + inputs + optional userId
- `computeInstanceId()` — Short URL-safe instance ID (user-independent)
- `prepareInputs()` — Auto-generate `id` for `uniqueInstance` cards
- `MemoryStateStore` — In-memory state (swap for Redis/Postgres in production)
- Full TypeScript types for inputs, actions, state, webhooks

### @hashdo/mcp-adapter
- `serveMcp()` — Start an MCP stdio server from card definitions
- `createMcpCardServer()` — Create server programmatically
- MCP Apps protocol with shared widget for interactive card rendering
- Automatic Zod schema generation from card input definitions
- State management across tool invocations

### @hashdo/screenshot
- `renderHtmlToImage()` — Render card HTML to PNG via Puppeteer
- Used for image responses in clients that don't support HTML

### @hashdo/cli
- `hashdo serve [dir]` — Start MCP server exposing cards as tools
- `hashdo start [dir]` — Production HTTP server with REST API + MCP endpoint
- `hashdo preview [dir]` — HTTP server for card development/preview
- `hashdo list [dir]` — List discovered cards with inputs/actions
- Web UI with card search, developer docs (`/docs`), and online card editor (`/editor`)
