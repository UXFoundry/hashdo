import { type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  type CardDefinition,
  type InputSchema,
  type CardState,
  type StateStore,
  MemoryStateStore,
  renderCard,
} from '@hashdo/core';
import { renderHtmlToImage } from '@hashdo/screenshot';
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { inputSchemaToZodShape } from './schema.js';

export interface McpCardServerOptions {
  /** Server name shown to MCP clients */
  name: string;
  /** Server version */
  version: string;
  /** Cards to expose as tools */
  cards: CardDefinition[];
  /** State storage backend (defaults to in-memory) */
  stateStore?: StateStore;
  /** Absolute paths to card directories (for resolving templates), keyed by card name */
  cardDirs?: Record<string, string>;
  /** Custom instructions for the AI about how to use #do/ cards */
  instructions?: string;
  /** Render card HTML to PNG images in tool responses. Requires Chromium. */
  enableScreenshots?: boolean;
}

/** URI for the shared card widget resource */
const WIDGET_RESOURCE_URI = 'ui://hashdo/card-widget.html';

/**
 * Self-contained widget HTML that renders card output inside an MCP Apps iframe.
 * Receives tool results via the App class postMessage protocol, then injects
 * the card HTML from _meta.html into the DOM.
 */
const WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; }
  #card { width: 100%; }
</style>
</head>
<body>
<div id="card"></div>
<script>
// Inline MCP Apps protocol — no CDN dependency needed.
// Implements the ui/initialize handshake + tool-result listener.
(function() {
  var host = window.parent;
  var reqId = 1;

  function send(msg) { host.postMessage(msg, '*'); }

  function render(html) {
    if (html) document.getElementById('card').innerHTML = html;
  }

  // Listen for all host messages
  window.addEventListener('message', function(event) {
    if (event.source !== host) return;
    var msg = event.data;
    if (!msg) return;

    // Handle ui/initialize response (has result.protocolVersion)
    if (msg.id && msg.result && msg.result.protocolVersion) {
      send({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} });
      return;
    }

    // Handle tool result notification
    if (msg.method === 'ui/notifications/tool-result' && msg.params) {
      render(msg.params._meta ? msg.params._meta.html : null);
      return;
    }
  });

  // Send ui/initialize request to start the handshake
  send({
    jsonrpc: '2.0',
    id: reqId++,
    method: 'ui/initialize',
    params: {
      protocolVersion: '2026-01-26',
      appInfo: { name: 'HashDo Card', version: '1.0.0' },
      appCapabilities: {}
    }
  });
})();
</script>
</body>
</html>`;

/**
 * Create an MCP server that exposes HashDo cards as MCP Apps tools.
 *
 * Each card becomes:
 * - A tool named `{card.name}` with the card's inputs as parameters
 * - Each card action becomes a tool named `{card.name}__{action}`
 *
 * Tools declare a ui:// resource so MCP Apps hosts (ChatGPT, Claude, VS Code)
 * render interactive card HTML in a sandboxed iframe.
 */
export function createMcpCardServer(options: McpCardServerOptions) {
  const { name, version, cards, cardDirs = {}, enableScreenshots = false } = options;
  const stateStore = options.stateStore ?? new MemoryStateStore();

  const server = new McpServer(
    { name, version },
    { instructions: options.instructions ?? generateInstructions(cards) },
  );

  // Register the shared widget resource (one resource serves all cards)
  registerAppResource(
    server,
    'HashDo Card Widget',
    WIDGET_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [{
        uri: WIDGET_RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: WIDGET_HTML,
        _meta: {
          ui: {
            domain: 'hashdo',
            csp: {
              resourceDomains: [],
              connectDomains: [],
            },
          },
        },
      }],
    }),
  );

  for (const card of cards) {
    registerCardTool(server, card, stateStore, cardDirs[card.name], enableScreenshots);
    registerActionTools(server, card, stateStore);
  }

  registerListTool(server, cards, stateStore);

  return server;
}

/**
 * Generate default instructions that teach the AI about the #do/ pattern.
 */
function generateInstructions(cards: CardDefinition[]): string {
  const cardList = cards
    .map((c) => {
      const tag = c.name.startsWith('do-') ? `#do/${c.name.slice(3)}` : `#${c.name}`;
      return `  - ${tag} → call the "${c.name}" tool. ${c.description}`;
    })
    .join('\n');

  return `You have access to HashDo actionable cards. When the user types a #do/ command (like #do/weather), invoke the matching tool immediately.

Available cards:
${cardList}

Behavior:
- When the user types "#do/weather" or "#do/weather Tokyo", call the do-weather tool right away.
- Parse any text after the command as input (e.g. "#do/weather Paris" → city: "Paris").
- If the tool returns text output, present it directly to the user formatted nicely.
- You can also invoke these tools proactively when relevant to the conversation.
- All inputs are optional unless marked required — the cards have smart defaults.
- When the user types just "#do" or "#do/list", call the "do-list" tool to show available commands.`;
}

/**
 * Register the main card tool (getData + render) as an MCP App tool.
 */
function registerCardTool(
  server: McpServer,
  card: CardDefinition,
  stateStore: StateStore,
  cardDir: string | undefined,
  enableScreenshots: boolean
) {
  const zodShape = inputSchemaToZodShape(card.inputs);

  registerAppTool(
    server,
    card.name,
    {
      description: card.description,
      inputSchema: zodShape,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
      _meta: {
        ui: {
          resourceUri: WIDGET_RESOURCE_URI,
          domain: 'hashdo',
          csp: {
            resourceDomains: ['esm.sh'],
            connectDomains: [],
          },
        },
      },
    },
    async (params: Record<string, unknown>) => {
      const inputs = params as any;
      const cardKey = `card:${card.name}:${stableKey(inputs)}`;

      // Load existing state
      const state = (await stateStore.get(cardKey)) ?? {};

      // Render card
      const result = await renderCard(card, inputs, state, cardDir);

      // Persist updated state
      if (result.state && Object.keys(result.state).length > 0) {
        await stateStore.set(cardKey, result.state);
      }

      // Track usage
      const usageKey = `usage:${card.name}`;
      const usageState = await stateStore.get(usageKey);
      const usageCount = (usageState?.['count'] as number) ?? 0;
      await stateStore.set(usageKey, { count: usageCount + 1 });

      // Build content array (backward compat for non-Apps hosts)
      const content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
      > = [];

      if (result.textOutput) {
        content.push({ type: 'text' as const, text: result.textOutput });
      }

      if (enableScreenshots) {
        const imageBuffer = await renderHtmlToImage(result.html);
        if (imageBuffer) {
          content.push({
            type: 'image' as const,
            data: imageBuffer.toString('base64'),
            mimeType: 'image/png',
          });
        }
      }

      // Fallback: raw HTML as text for non-Apps clients without screenshots
      if (content.length === 0) {
        content.push({ type: 'text' as const, text: result.html });
      }

      return {
        content,
        // viewModel visible to both model and widget (no raw HTML — breaks ChatGPT React hydration)
        structuredContent: result.viewModel,
        // HTML only visible to widget (not the model)
        _meta: { html: result.html },
      };
    }
  );
}

/**
 * Register each card action as a separate tool.
 * Tool name format: `{cardName}__{actionName}`
 */
function registerActionTools(
  server: McpServer,
  card: CardDefinition,
  stateStore: StateStore
) {
  if (!card.actions) return;

  for (const [actionName, action] of Object.entries(card.actions)) {
    const toolName = `${card.name}__${actionName}`;

    // Merge card inputs + action-specific inputs for the tool schema
    const combinedInputs: InputSchema = {
      ...card.inputs,
      ...(action.inputs ?? {}),
    };
    const zodShape = inputSchemaToZodShape(combinedInputs);

    const description =
      action.description ?? `${action.label} — action on ${card.name} card`;

    server.registerTool(
      toolName,
      {
        description,
        inputSchema: zodShape,
        annotations: {
          readOnlyHint: false,
          openWorldHint: false,
          destructiveHint: false,
        },
      },
      async (params: Record<string, unknown>) => {
        const cardInputs: Record<string, unknown> = {};
        const actionInputs: Record<string, unknown> = {};

        // Split params into card inputs vs action inputs
        for (const [key, val] of Object.entries(params)) {
          if (key in card.inputs) {
            cardInputs[key] = val;
          } else {
            actionInputs[key] = val;
          }
        }

        const cardKey = `card:${card.name}:${stableKey(cardInputs)}`;
        const state = (await stateStore.get(cardKey)) ?? {};

        const result = await action.handler({
          cardInputs: cardInputs as any,
          state,
          actionInputs,
        });

        // Persist updated state
        if (result.state) {
          const newState = { ...state, ...result.state };
          await stateStore.set(cardKey, newState);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: result.message ?? JSON.stringify(result.output ?? { ok: true }),
            },
          ],
        };
      }
    );
  }
}

/**
 * Register a `do-list` tool that lists available cards sorted by usage.
 */
function registerListTool(
  server: McpServer,
  cards: CardDefinition[],
  stateStore: StateStore
) {
  server.registerTool(
    'do-list',
    {
      description: 'List all available #do/ cards, sorted by most used',
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    async () => {
      // Gather usage counts
      const cardsWithUsage = await Promise.all(
        cards.map(async (card) => {
          const usageKey = `usage:${card.name}`;
          const usageState = await stateStore.get(usageKey);
          const count = (usageState?.['count'] as number) ?? 0;
          const tag = card.name.startsWith('do-')
            ? `#do/${card.name.slice(3)}`
            : `#${card.name}`;
          return { card, tag, count };
        })
      );

      // Sort by usage (descending), then alphabetically
      cardsWithUsage.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.tag.localeCompare(b.tag);
      });

      const lines = cardsWithUsage.map(({ card, tag, count }) => {
        const inputs = Object.keys(card.inputs).join(', ');
        const usageLabel = count > 0 ? ` (used ${count}x)` : '';
        return `**${tag}**${usageLabel}\n  ${card.description}\n  Inputs: ${inputs || 'none'}`;
      });

      const text = `Available #do/ cards:\n\n${lines.join('\n\n')}`;

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );
}

/**
 * Create a stable key from input values for state lookups.
 */
function stableKey(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj)
    .sort()
    .map((k) => `${k}=${obj[k]}`)
    .join('&');
  return Buffer.from(sorted).toString('base64url');
}

/**
 * Start the MCP server on stdio transport (standard for MCP).
 */
export async function serveMcp(options: McpCardServerOptions): Promise<void> {
  const server = createMcpCardServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Handle a single MCP HTTP request using Streamable HTTP transport.
 * Designed to be mounted as a route handler in an existing HTTP server.
 *
 * Creates a fresh stateless transport per request, connects an MCP server,
 * and delegates to the transport's handleRequest.
 */
export async function handleMcpRequest(
  options: McpCardServerOptions,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  const server = createMcpCardServer(options);
  await server.connect(transport);
  await transport.handleRequest(req, res);
}
