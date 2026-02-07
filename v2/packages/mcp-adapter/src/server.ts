import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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

/**
 * Create an MCP server that exposes HashDo cards as tools.
 *
 * Each card becomes:
 * - A tool named `{card.name}` with the card's inputs as parameters
 * - Each card action becomes a tool named `{card.name}__{action}`
 *
 * When enableScreenshots is true, tool responses include rendered PNG images
 * alongside text output.
 */
export function createMcpCardServer(options: McpCardServerOptions) {
  const { name, version, cards, cardDirs = {}, enableScreenshots = false } = options;
  const stateStore = options.stateStore ?? new MemoryStateStore();

  const server = new McpServer(
    { name, version },
    { instructions: options.instructions ?? generateInstructions(cards) },
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
 * Register the main card tool (getData + render).
 */
function registerCardTool(
  server: McpServer,
  card: CardDefinition,
  stateStore: StateStore,
  cardDir: string | undefined,
  enableScreenshots: boolean
) {
  const zodShape = inputSchemaToZodShape(card.inputs);

  server.tool(
    card.name,
    card.description,
    zodShape,
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

      // Build response content
      const content: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; data: string; mimeType: string }
      > = [];

      // Text output (readable summary for chat clients)
      if (result.textOutput) {
        content.push({ type: 'text' as const, text: result.textOutput });
      }

      // Screenshot (rendered card image)
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

      // Raw HTML (for MCP Apps-compatible clients or fallback)
      content.push({ type: 'text' as const, text: result.html });

      return { content };
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

    server.tool(
      toolName,
      description,
      zodShape,
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
  server.tool(
    'do-list',
    'List all available #do/ cards, sorted by most used',
    {},
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
