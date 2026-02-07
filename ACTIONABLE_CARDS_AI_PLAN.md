# HashDo Reimagined: Actionable Cards for the AI Age

## 1. What HashDo Is Today

HashDo (v0.10.74) is a Node.js framework for creating **stateful interaction cards** — self-contained, embeddable UI micro-apps. Each card:

- Lives in a **pack** (a themed collection like `hashdo-weather`, `hashdo-restaurants`)
- Declares typed **inputs** with validation
- Runs server-side logic via `getCardData(params, state, callback)`
- Renders to a **self-contained HTML document** (CSS + JS + template inlined)
- Maintains **persistent state** across renders (in-memory or MongoDB)
- Supports **real-time sync** via Firebase
- Handles **webhooks** for external event-driven updates
- Provides client-side APIs for state, analytics, modals, and proxied API calls
- Secures inputs via JWT encryption and issues one-time API keys

**Architecture summary:**

```
Card Pack (hashdo-*)
├── card.js          → inputs schema + getCardData() + webHook()
├── public/card/     → main.js (client logic) + styles (SCSS/LESS/CSS)
└── templates/card/  → main.jade / card.hbs / main.html

Framework (hashdo core)
├── packs.js         → discovers and catalogs card packs from disk
├── card.js          → renders cards: validates inputs → loads state → calls getCardData → compiles CSS/JS → renders template → minifies → returns HTML
├── db.js            → pluggable storage (state, locks, API keys)
├── template.js      → multi-engine rendering (Jade, Handlebars, HTML)
├── style.js         → multi-preprocessor CSS (LESS, SASS, plain)
├── firebase.js      → real-time state broadcast
├── analytics.js     → pluggable event tracking
└── utils.js         → JWT card keys, deep merge
```

**Key insight:** HashDo was ahead of its time. It solved the same problem that ChatGPT Apps, MCP Apps, Google A2UI, and Microsoft Adaptive Cards are solving today — rendering interactive, actionable UI components from structured data — but it did so in 2016-era technology.

---

## 2. The AI-Age Landscape (2025-2026)

Every major AI platform has converged on the same pattern: **LLM tool use produces structured data → rendered as interactive card UI in the conversation stream.**

### Current Players

| Platform | Approach | UI Model |
|----------|----------|----------|
| **ChatGPT Apps SDK** | MCP-based apps with inline/fullscreen/PiP modes | HTML in sandboxed iframe, UI kit components |
| **MCP Apps** | Extension to Model Context Protocol adding UI layer | Sandboxed HTML templates declared upfront |
| **Google A2UI** | Declarative JSON protocol for agent-driven UIs | Native component blueprints (framework-agnostic) |
| **Microsoft Adaptive Cards** | JSON-authored UI snippets in Copilot/Teams | Native rendering matching host app style |
| **Claude Artifacts** | AI-generated interactive apps beside chat | Live code execution (HTML/JS/React) |
| **Vercel AI SDK** | Generative UI via React components mapped to tools | React components rendered on tool results |
| **Shopify MCP-UI** | Commerce cards via `ui://` resource URIs | Sandboxed iframe product cards |

### The Emerging Protocol Stack

```
┌─────────────────────────────────────────────┐
│  Agent-to-Agent (A2A)                       │  Multi-agent coordination
├─────────────────────────────────────────────┤
│  Tools & Data (MCP)                         │  Standardized tool invocation
├─────────────────────────────────────────────┤
│  Agent Runtime (AG-UI / CopilotKit)         │  Streaming agent events to frontends
├─────────────────────────────────────────────┤
│  UI Rendering (A2UI / MCP Apps)             │  Interactive card interfaces
└─────────────────────────────────────────────┘
```

### The Gap

Despite this convergence, there is **no unified, open framework** that lets developers:

1. Write a card once and have it work across ChatGPT, Claude, Copilot, Gemini, and standalone apps
2. Package cards into discoverable, composable packs
3. Manage card state, analytics, and security across AI platforms
4. Test and preview cards independently of any AI host

**HashDo's architecture maps almost perfectly to this gap.**

---

## 3. Strategic Vision: HashDo as an AI-Native Card Platform

### The Pitch

> **HashDo 2.0** — The universal framework for building actionable cards that work everywhere AI lives. Write once, render in ChatGPT, Claude, Copilot, Gemini, or any MCP-compatible client.

### Core Concept

Transform HashDo from a standalone card renderer into a **multi-target card compiler and runtime** that speaks the native protocol of every major AI platform:

```
Developer writes:               HashDo compiles to:

  hashdo card definition   ───→  MCP App (tool + UI template)
  (inputs + logic +             A2UI component blueprint
   template + state)            Adaptive Card JSON
                                Claude Artifact
                                Standalone HTML (legacy)
                                React/Web Component
```

---

## 4. Architecture Plan

### 4.1 Modernized Card Definition

Evolve the card module format to be declarative, TypeScript-first, and AI-aware:

```typescript
// hashdo-weather/temperature.card.ts
import { defineCard } from '@hashdo/core';

export default defineCard({
  name: 'Temperature',
  description: 'Shows current temperature for a location',  // Used by LLMs for tool selection
  icon: './icon.svg',

  // Typed input schema — doubles as LLM tool parameter schema
  inputs: {
    latitude:  { type: 'number', required: true, description: 'Latitude coordinate' },
    longitude: { type: 'number', required: true, description: 'Longitude coordinate' },
    units:     { type: 'string', enum: ['celsius', 'fahrenheit'], default: 'celsius' },
  },

  // Server-side data fetching
  async getData({ inputs, state }) {
    const weather = await fetch(`https://api.weather.com/...`);
    return {
      viewModel: { temp: weather.temp, condition: weather.condition },
      state: { lastChecked: Date.now() },
    };
  },

  // Webhook for push updates (e.g., weather alerts)
  async onWebhook({ payload, state }) {
    return { state: { alert: payload.alert } };
  },

  // Actions the user can take ON the card (new concept)
  actions: {
    toggleUnits: {
      label: 'Switch Units',
      async handler({ inputs, state }) {
        const newUnits = state.units === 'celsius' ? 'fahrenheit' : 'celsius';
        return { state: { units: newUnits } };
      }
    },
    setAlert: {
      label: 'Set Weather Alert',
      inputs: { threshold: { type: 'number', description: 'Alert temperature' } },
      async handler({ inputs, state }) {
        // Register alert...
        return { state: { alertThreshold: inputs.threshold } };
      }
    }
  },

  // Template — supports JSX, Handlebars, or plain HTML
  template: 'temperature.hbs',
});
```

**What changed from original HashDo:**
- TypeScript with full type inference
- `description` fields on everything (LLMs use these for tool selection)
- `actions` — named operations users can trigger from the card (maps to MCP tools, A2UI events, Adaptive Card actions)
- Async/await instead of callbacks
- Declarative enough to auto-generate OpenAPI, MCP tool definitions, and A2UI schemas

### 4.2 Multi-Target Compilation

The compiler translates a single card definition into platform-specific outputs:

```
@hashdo/compiler
├── targets/
│   ├── mcp-app.ts        → MCP tool definition + HTML UI template
│   ├── a2ui.ts           → A2UI JSON component blueprint
│   ├── adaptive-card.ts  → Microsoft Adaptive Card JSON
│   ├── artifact.ts       → Claude Artifact (self-contained React)
│   ├── standalone.ts     → Classic HashDo HTML document
│   ├── react.ts          → React component
│   └── web-component.ts  → Standard Web Component
```

Each target maps the card's inputs, getData, actions, and template into the native format. For example:

- **MCP App target**: Generates an MCP server that exposes the card as a tool (inputs become tool parameters), and registers an HTML UI template for rendering results
- **A2UI target**: Generates a JSON blueprint using A2UI's component catalog (Card, Text, Button, Image, etc.) with dynamic data bindings
- **Adaptive Card target**: Generates Adaptive Card JSON with Action.Submit for card actions

### 4.3 Runtime Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     @hashdo/runtime                          │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Card Loader  │  │ State Manager│  │ Action Dispatcher   │ │
│  │ (pack disco- │  │ (pluggable:  │  │ (routes actions to  │ │
│  │  very, hot   │  │  memory,     │  │  card handlers,     │ │
│  │  reload)     │  │  redis,      │  │  validates inputs)  │ │
│  │             │  │  postgres,   │  │                     │ │
│  │             │  │  firebase)   │  │                     │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Auth/Security│  │ Analytics    │  │ Webhook Registry    │ │
│  │ (JWT, API    │  │ (pluggable:  │  │ (incoming webhook   │ │
│  │  keys, input │  │  console,    │  │  routing, Firebase  │ │
│  │  encryption) │  │  posthog,    │  │  real-time push)    │ │
│  │             │  │  segment)    │  │                     │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │              Protocol Adapters                           ││
│  │  ┌─────┐ ┌──────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ││
│  │  │ MCP │ │ REST │ │ WebSocket│ │GraphQL │ │ gRPC     │ ││
│  │  └─────┘ └──────┘ └──────────┘ └────────┘ └──────────┘ ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 4.4 MCP-First Distribution

Cards become MCP servers — the universal adapter for AI platforms:

```bash
# Publish a card pack as an MCP server
npx @hashdo/cli publish hashdo-weather --target mcp

# This creates an MCP server that:
# 1. Exposes each card as a tool (inputs → tool parameters)
# 2. Registers UI templates for MCP Apps rendering
# 3. Handles state via the configured backend
# 4. Routes webhooks and actions
```

Any MCP-compatible client (ChatGPT, Claude, VS Code, Goose, etc.) can then discover and use these cards.

### 4.5 Card Pack Marketplace

An npm-like registry for AI-ready card packs:

```bash
# Install a card pack
npx @hashdo/cli install @hashdo/weather @hashdo/finance @hashdo/productivity

# Run a local card server (MCP + REST + preview UI)
npx @hashdo/cli serve

# Browse available packs
npx @hashdo/cli search "restaurant booking"
```

---

## 5. Innovative Ideas

### 5.1 AI-Generated Cards

Cards that write themselves. Given a natural language description, an LLM generates the full card definition:

```
User: "I need a card that shows my GitHub PR review queue with approve/request-changes buttons"

→ HashDo AI generates:
  - Input schema (github_token, repo, username)
  - getData() calling GitHub API
  - Template with PR list, diff stats, status badges
  - Actions: approve, request_changes, add_comment
  - All compiled to MCP App automatically
```

This is the "Artifacts for card developers" model — rapid prototyping of actionable cards through conversation.

### 5.2 Composable Card Chains

Cards that trigger other cards, forming workflows:

```typescript
defineCard({
  name: 'Travel Planner',
  compose: [
    { card: '@hashdo/weather/forecast', map: { location: 'inputs.destination' } },
    { card: '@hashdo/flights/search', map: { to: 'inputs.destination', date: 'inputs.date' } },
    { card: '@hashdo/hotels/book', map: { city: 'inputs.destination', checkin: 'inputs.date' } },
  ],
  layout: 'stack', // stack, grid, tabs, carousel
});
```

The AI can orchestrate these chains dynamically: "Plan me a trip to Tokyo next month" triggers weather → flights → hotels → restaurants as a composed card deck.

### 5.3 Stateful Card Conversations

Cards that remember context across an entire conversation thread, not just a single render:

```
Turn 1: User asks "Show me AAPL stock"
  → Finance card renders with price chart, state saved

Turn 2: User asks "Compare it with MSFT"
  → Same card instance updates to show comparison (state carries forward)

Turn 3: User says "Set an alert if AAPL drops below $150"
  → Card registers webhook, shows alert configuration

Turn 4: (Later) Webhook fires → Card pushes notification via real-time channel
```

This leverages HashDo's existing state management but extends it to be **conversation-scoped** rather than just card-scoped.

### 5.4 Cards as Agent Tools

Cards become first-class tools that AI agents can use autonomously:

```
Agent task: "Book me the cheapest flight to London next Friday"

Agent reasoning:
1. Use @hashdo/flights/search(dest="London", date="next Friday") → gets options
2. Use @hashdo/flights/search.actions.sort(by="price") → finds cheapest
3. Use @hashdo/flights/book.actions.reserve(flight_id="...") → books it
4. Use @hashdo/email/send(to="user", subject="Flight booked") → confirms

Each step renders a card the user can see and override.
```

The card's `actions` become tools the agent can call, with the card UI providing transparency into what the agent is doing. Users can intervene at any card.

### 5.5 Reactive Cards with Live Data Streams

Cards that subscribe to real-time data streams and update continuously:

```typescript
defineCard({
  name: 'Live Dashboard',
  streams: {
    stockPrice: { source: 'wss://market-data.example.com', filter: 'AAPL' },
    sentiment:  { source: 'mcp://social-monitor/sentiment', query: 'Apple' },
  },
  template: ({ streams }) => `
    <div class="dashboard">
      <span class="price">${streams.stockPrice.latest}</span>
      <span class="sentiment ${streams.sentiment.trend}">${streams.sentiment.score}</span>
    </div>
  `,
});
```

### 5.6 Card Permissions and Trust Model

A security model designed for AI interactions where cards can take real-world actions:

```typescript
defineCard({
  permissions: {
    read: 'auto',           // AI can invoke without asking
    write: 'confirm',       // Show confirmation card before executing
    financial: 'explicit',  // Require explicit user approval each time
    destructive: 'mfa',     // Require multi-factor authentication
  },
  actions: {
    viewBalance:  { permission: 'read', ... },
    transfer:     { permission: 'financial', ... },
    closeAccount: { permission: 'destructive', ... },
  }
});
```

### 5.7 Offline-First Cards

Cards that work without connectivity and sync when back online — critical for mobile and embedded contexts:

```typescript
defineCard({
  offline: {
    cacheDuration: '24h',
    syncStrategy: 'last-write-wins',
    fallbackTemplate: 'offline.hbs',  // Shows cached data with "last updated" badge
  },
});
```

---

## 6. Migration Path from Current HashDo

### Phase 1: Modernize Core (Keep backward compatibility)

- [ ] Migrate to TypeScript
- [ ] Replace callbacks with async/await
- [ ] Replace Jade with modern template options (keep Handlebars, add JSX)
- [ ] Replace Firebase v2 with modern real-time options (Firebase v9+, WebSocket, SSE)
- [ ] Replace in-memory default DB with SQLite (still zero-config but persistent)
- [ ] Add ESM module support
- [ ] Update all dependencies to current versions

### Phase 2: Add AI-Native Features

- [ ] Add `description` fields to all schema elements (for LLM tool selection)
- [ ] Add `actions` to card definition format
- [ ] Implement MCP server adapter (expose cards as MCP tools)
- [ ] Implement MCP Apps UI template generation
- [ ] Add conversation-scoped state management
- [ ] Build CLI tool (`@hashdo/cli`) for development, testing, publishing

### Phase 3: Multi-Target Compilation

- [ ] Build compiler infrastructure with pluggable targets
- [ ] Implement A2UI target
- [ ] Implement Adaptive Card target
- [ ] Implement React component target
- [ ] Implement Web Component target
- [ ] Build card preview/playground UI

### Phase 4: Ecosystem

- [ ] Card pack registry (npm-based or custom)
- [ ] AI card generator (describe a card, get a working implementation)
- [ ] Card composition and chaining
- [ ] Marketplace with community packs
- [ ] VS Code extension for card development
- [ ] Documentation site with interactive examples

---

## 7. Competitive Positioning

| Feature | HashDo 2.0 | ChatGPT Apps SDK | MCP Apps | A2UI | Adaptive Cards |
|---------|-----------|-------------------|----------|------|----------------|
| Write once, run everywhere | **Yes** | ChatGPT only | MCP clients | A2UI clients | Microsoft only |
| Self-contained card packs | **Yes** | No (apps are monolithic) | No | No | No |
| Stateful across renders | **Yes** | Limited | No built-in | No | No |
| Webhook/push updates | **Yes** | No | No | No | No |
| Open source | **Yes** | No | Spec only | Yes | Spec only |
| Card composition | **Yes** | No | No | No | No |
| Works without AI host | **Yes** | No | No | No | Limited |
| AI-generated cards | **Yes** | No | No | No | No |

### The Unique Value Proposition

HashDo 2.0 would be the **only framework** that:

1. Treats cards as **portable, composable units** (like npm packages for UI interactions)
2. Compiles to **every major AI platform** from a single source
3. Includes built-in **state management, security, and real-time updates**
4. Works **with or without** an AI host (standalone embedding still works)
5. Has a **pack ecosystem** with discovery and sharing

---

## 8. Naming and Branding Suggestions

The "HashDo" name carries the right energy — **hash** (addressable, composable) + **do** (actionable). Potential evolution:

- **HashDo** — Keep the name, modernize the brand. "#do" as a tagline.
- **CardKit AI** — If targeting the AI developer market specifically
- **ActionCards** — Descriptive, direct
- **Cardflow** — Emphasizes composition and workflow
- **HashDo MCP** — If leading with the MCP integration angle

---

## 9. First Steps

1. **Fork and modernize** — Get the existing codebase running on current Node.js with updated dependencies
2. **Build one MCP card** — Take a simple card concept (e.g., weather) and manually wire it as an MCP tool + MCP App, proving the concept works end-to-end in Claude or ChatGPT
3. **Define the card spec v2** — Write the TypeScript interface for the new card definition format
4. **Build the MCP adapter** — Automate the translation from card definition to MCP server
5. **Ship a demo** — 3-5 cards working across ChatGPT and Claude as proof of concept
