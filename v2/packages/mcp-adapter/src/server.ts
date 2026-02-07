import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type CardDefinition,
  type InputSchema,
  type CardState,
  type StateStore,
  MemoryStateStore,
  renderCard,
} from '@hashdo/core';
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
}

/**
 * Create an MCP server that exposes HashDo cards as tools.
 *
 * Each card becomes:
 * - A tool named `{card.name}` with the card's inputs as parameters
 * - Each card action becomes a tool named `{card.name}__{action}`
 *
 * The tool response includes rendered HTML content that MCP Apps-compatible
 * clients can display inline.
 */
export function createMcpCardServer(options: McpCardServerOptions) {
  const { name, version, cards, cardDirs = {} } = options;
  const stateStore = options.stateStore ?? new MemoryStateStore();

  const server = new McpServer({ name, version });

  for (const card of cards) {
    registerCardTool(server, card, stateStore, cardDirs[card.name]);
    registerActionTools(server, card, stateStore);
  }

  return server;
}

/**
 * Register the main card tool (getData + render).
 */
function registerCardTool(
  server: McpServer,
  card: CardDefinition,
  stateStore: StateStore,
  cardDir?: string
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

      return {
        content: [
          {
            type: 'text' as const,
            text: result.html,
          },
        ],
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
