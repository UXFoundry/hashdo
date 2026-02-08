# HashDo — Live Data Cards for AI

HashDo turns live data into rich, interactive cards that work inside AI conversations. Build a card once and it becomes an MCP tool that works in ChatGPT, Claude, VS Code, and any MCP-compatible client.

**Live at [hashdo.com](https://hashdo.com)**

## Available Cards

| Tag | Card | Description |
|-----|------|-------------|
| `#do/weather` | do-weather | Current weather for any location with auto-detection via IP geolocation |
| `#do/stock` | do-stock | Stock price lookup with daily change and key stats |
| `#do/crypto` | do-crypto | Cryptocurrency price, 24h change, and market cap |
| `#do/qr` | do-qr | Generate a QR code from text or a URL |
| `#do/city` | do-city | City explorer — weather, local time, population, currency, and languages |

## Quick Start

```bash
cd v2
npm install
npm run build

# Start MCP server (stdio) with all demo cards
npx tsx serve-demo.ts

# Start HTTP server with web UI, API, and MCP endpoint
node packages/cli/dist/cli.js start demo-cards
```

The HTTP server runs on port 3000 and exposes:
- **Web UI** — card browser with search, developer docs (`/docs`), card editor (`/editor`)
- **REST API** — `GET /api/cards`, `POST /api/cards/:name`, `GET /api/cards/:name/image`
- **MCP endpoint** — `POST /mcp` (Streamable HTTP)
- **OpenAPI spec** — `GET /api/openapi.json`

## MCP Client Setup

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "hashdo": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/hashdo/v2/serve-demo.ts"]
    }
  }
}
```

**Claude Code** — add to `.mcp.json`:
```json
{
  "mcpServers": {
    "hashdo": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/hashdo/v2/serve-demo.ts"]
    }
  }
}
```

## Architecture

```
v2/
├── packages/
│   ├── core/           # Card types, defineCard(), renderCard()
│   ├── mcp-adapter/    # MCP server with Apps widget support
│   ├── screenshot/     # HTML → PNG via Puppeteer
│   └── cli/            # HTTP server, card discovery, dev tools
├── demo-cards/
│   ├── weather/        # do-weather
│   ├── stock-quote/    # do-stock
│   ├── crypto-quote/   # do-crypto
│   ├── qr-code/        # do-qr
│   └── city-explorer/  # do-city
├── serve-demo.ts       # Standalone MCP stdio server
└── Dockerfile          # Production image (Node 20 + Chromium)
```

## Packages

**[@hashdo/core](v2/packages/core/)** — Card definition types, `defineCard()` for type-safe authoring, `renderCard()` for HTML generation, Handlebars template support.

**[@hashdo/mcp-adapter](v2/packages/mcp-adapter/)** — Exposes cards as MCP tools with automatic Zod schema generation. Implements MCP Apps protocol with a shared widget for interactive card rendering in supported clients.

**[@hashdo/screenshot](v2/packages/screenshot/)** — Renders card HTML to PNG images using Puppeteer. Used for image responses in clients that don't support HTML.

**[@hashdo/cli](v2/packages/cli/)** — HTTP server with card discovery, hot reload, REST API, MCP endpoint, usage tracking, developer docs, and an online card editor.

## Defining a Card

```typescript
import { defineCard } from '@hashdo/core';

export default defineCard({
  name: 'do-example',
  description: 'Used by LLMs to decide when to invoke this tool',

  inputs: {
    query: { type: 'string', required: true, description: 'Search query' },
  },

  async getData({ inputs }) {
    const data = await fetchSomething(inputs.query);
    return {
      viewModel: { data },
      textOutput: `Result: ${data.summary}`,
    };
  },

  template: (vm) => `<div>${vm.data}</div>`,
});
```

Each card automatically becomes an MCP tool — inputs map to tool parameters, `getData()` runs server-side, and the template renders HTML returned to the client.

## Deployment

The included Dockerfile builds a production image with Node 20 and Chromium (for screenshot rendering):

```bash
docker build -t hashdo v2/
docker run -p 3000:3000 hashdo
```

Deploys to Railway, Fly.io, or any container platform.

## License

Apache License 2.0 — see [LICENSE](LICENSE) for details.
