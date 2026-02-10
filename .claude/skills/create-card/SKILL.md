---
name: create-card
description: Create a new HashDo card. Use when the user wants to build a new card, asks "create a card", or says "/create-card". Guides scaffolding, implementation, and building.
argument-hint: <card-name> [description]
---

# HashDo Card Creation Guide

You are creating a new HashDo v2 card. Follow this process exactly.

## Step 1: Gather Requirements

Before writing any code, confirm with the user:
1. **Card name** — must be kebab-case, prefixed with `do-` (e.g. `do-weather`, `do-recipe`, `do-game-chess`)
2. **What it does** — one sentence: what data does it show? What API(s) does it call?
3. **Inputs** — what parameters does the user provide? Which are optional with sensible defaults?
4. **Actions** — any interactive state mutations? (favorites, toggles, votes, etc.)
5. **Shareable?** — should users be able to share a link to a specific card instance?
6. **Category** — is this a top-level card (`demo-cards/<name>/`) or nested under a category (`demo-cards/game/<name>/`)?

If the user provides a card name and description, infer reasonable answers for the rest and confirm before proceeding.

## Step 2: Scaffold Files

Every card needs exactly 3 files. Create them in the correct location:

### For top-level cards:
```
v2/demo-cards/<name>/
  card.ts          # Card definition (the only source file)
  package.json     # Package metadata
  tsconfig.json    # TypeScript config
```

### For nested/category cards (e.g. games):
```
v2/demo-cards/<category>/<name>/
  card.ts
  package.json
  tsconfig.json
```

### package.json template:
```json
{
  "name": "@hashdo/card-<name>",
  "version": "1.0.0",
  "description": "<one-line description>",
  "type": "module",
  "main": "card.js",
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@hashdo/core": "*"
  },
  "license": "MIT"
}
```

For nested cards, the package name should include the category: `@hashdo/card-<category>-<name>` (e.g. `@hashdo/card-game-chess`).

### tsconfig.json (always identical):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["card.ts"]
}
```

## Step 3: Write card.ts

Use this exact structure. Every card follows the same pattern:

```typescript
import { defineCard } from '@hashdo/core';

/**
 * #do/<tag> — <Short description>.
 *
 * <Longer explanation of what the card does, what APIs it uses, etc.>
 */
export default defineCard({
  name: 'do-<name>',

  description:
    '<LLM-optimized description. Be specific about when to use this tool. ' +
    'End with: All parameters have defaults — call this tool immediately without asking the user for parameters.>',

  shareable: true, // or omit if not shareable

  // Optional: custom state key for user-specific state
  // stateKey: (_inputs, userId) => userId ? `user:${userId}` : undefined,

  inputs: {
    // Every input should have a sensible default when possible
    exampleInput: {
      type: 'string',       // 'string' | 'number' | 'boolean' | 'date' | 'url' | 'email' | 'json'
      required: false,       // Prefer false with defaults over true
      default: 'sensible default value',
      description: 'Clear description. Mention the default behavior when omitted.',
      // enum: ['option1', 'option2'] as const,  // Optional: constrain values
      // sensitive: true,                          // Optional: for API keys etc.
    },
  },

  async getData({ inputs, rawInputs, state, baseUrl, userId }) {
    // ── 1. Validate & prepare inputs ────────────────────────────────
    // Use rawInputs to check if user explicitly provided a value
    // inputs has defaults already applied by defineCard()

    // ── 2. Fetch external data ──────────────────────────────────────
    // Call APIs, compute results, etc.
    // Throw descriptive errors on failure: throw new Error('Failed to ...: <detail>')

    // ── 3. Build text output for chat clients ───────────────────────
    // Markdown string with tables, headers, etc.
    // MCP adapter returns this as the tool response text
    let textOutput = `## Title\n\n`;
    textOutput += `| | |\n|---|---|\n`;
    textOutput += `| Key | Value |\n`;

    // ── 4. Build viewModel for HTML template ────────────────────────
    const viewModel = {
      // All data the template needs to render
    };

    return {
      viewModel,
      textOutput,
      state: {
        ...state,
        // Persist anything needed across renders
        lastChecked: new Date().toISOString(),
      },
    };
  },

  // Optional: user-triggered actions
  actions: {
    exampleAction: {
      label: 'Button Label',
      description: 'What this action does (for LLM docs)',
      // Optional action-specific inputs:
      // inputs: { itemId: { type: 'string', required: true, description: '...' } },
      async handler({ cardInputs, actionInputs, state }) {
        // Mutate state, return message
        return {
          state: { ...state, /* updates */ },
          message: 'Action completed',
        };
      },
    },
  },

  // Template: inline function or .hbs file path
  template: (vm) => `
    <div style="font-family:system-ui,sans-serif; padding:20px; max-width:380px;
                background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
                border-radius:12px; color:white;">
      <!-- Card HTML using viewModel values like ${`\${vm.field}`} -->
    </div>
  `,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Keep helper functions, interfaces, and API calls below the defineCard() export.
// Use typed interfaces for API responses.
// Prefer free, no-API-key services when possible.
```

## Key Rules

### Naming
- Card name: `do-<name>` (kebab-case, e.g. `do-weather`, `do-game-wordle`)
- Tag: `#do/<name>` (used in the JSDoc comment)
- Package: `@hashdo/card-<name>`

### Inputs
- **Always provide defaults** — cards should render immediately without user input
- Use `required: false` with `default` values whenever possible
- Write descriptions that help LLMs understand when/how to set the parameter
- Use `enum` with `as const` to constrain string values

### Description
- The `description` field is **critical** — LLMs use it to decide when to call the tool
- Be specific: mention trigger phrases like "when the user asks about X"
- End with encouragement to call immediately without prompting for params

### getData
- Numbered comment sections (── 1. ..., ── 2. ...) for readability
- Throw descriptive `Error` objects on failure
- Always return `textOutput` (markdown) for chat-based AI clients
- Always return `viewModel` for HTML rendering
- Spread `...state` when adding to existing state to preserve other keys

### Actions
- Use for stateful user interactions (favorites, toggles, votes)
- Keep handlers pure: read state, return new state
- Return a `message` string for user feedback
- For user-specific state, set `stateKey: (_inputs, userId) => userId ? \`user:${`\${userId}`}\` : undefined`

### Template
- Use inline `template: (vm) => \`...\`` for self-contained cards
- Style with inline CSS (no external stylesheets)
- Target `max-width: 320-400px` for card width
- Use gradients and `border-radius: 12-20px` for the outer container
- Use `system-ui, sans-serif` font stack
- Design for both light and dark backgrounds

### State
- `CardState` is `Record<string, unknown>` — arbitrary JSON
- State persists across renders via a key derived from inputs (or custom `stateKey`)
- Always spread existing state: `{ ...state, newField: value }`
- Track counters, lists, timestamps as needed

### Error Handling
- Throw `new Error('descriptive message')` from `getData` — the framework renders an error card
- Log errors with `console.error(`[<card-name>] ${detail}`)` before throwing
- Validate API responses before accessing nested properties

## Step 4: Build & Test

After creating the card files:

1. **Build the card:**
   ```bash
   cd v2/demo-cards/<name> && npx tsc
   ```

2. **Build all packages** (if dependencies changed):
   ```bash
   cd v2 && npm run build
   ```

3. **Start the dev server:**
   ```bash
   cd v2 && npm start
   ```

4. **Test via REST API:**
   - Card list: `GET http://localhost:3000/api/cards`
   - Render: `GET http://localhost:3000/api/cards/do-<name>?<params>`
   - Screenshot: `GET http://localhost:3000/api/cards/do-<name>/image?<params>`

5. **Test via MCP:** Connect Claude Desktop or any MCP client to `http://localhost:3000/mcp`

## Common Patterns (from existing cards)

### IP geolocation fallback (weather):
When location isn't provided, fall back to IP-based geolocation using `http://ip-api.com/json/`.

### Watchlist / favorites:
Store an array in state, toggle membership in an action handler. Return count in message.

### Accent colors by category:
Map a data field (subject, language, type) to gradient colors for visual variety.

### Deterministic sharing (poll):
Use `stateKey` to derive a stable ID from content (e.g. hash of question + options) so the same content always maps to the same shareable URL.

### User-specific state (book, reading list):
Set `stateKey: (_inputs, userId) => userId ? \`user:${`\${userId}`}\` : undefined` to isolate state per anonymous user.

## Checklist

Before marking the card complete, verify:
- [ ] `card.ts` exports `defineCard({...})` as default
- [ ] `package.json` has correct name, main: "card.js", type: "module"
- [ ] `tsconfig.json` targets ES2022, Node16 module resolution
- [ ] Card name starts with `do-`
- [ ] All inputs have descriptions and sensible defaults
- [ ] `getData` returns `viewModel`, `textOutput`, and `state`
- [ ] Template renders a self-contained, styled HTML card
- [ ] Helper functions and interfaces are below the export
- [ ] Card compiles with `tsc` without errors
- [ ] Card appears in `GET /api/cards` when server is running
