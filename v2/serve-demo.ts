#!/usr/bin/env npx tsx

/**
 * HashDo MCP Server — Actionable cards for AI chat.
 *
 * Type #do/weather, #do/stock, or #do/qr in any MCP-compatible AI chat
 * and get instant, actionable results.
 *
 * Usage:
 *   npx tsx serve-demo.ts
 *
 * Claude Desktop — add to ~/Library/Application Support/Claude/claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "hashdo": {
 *         "command": "npx",
 *         "args": ["tsx", "/absolute/path/to/hashdo/v2/serve-demo.ts"]
 *       }
 *     }
 *   }
 *
 * Claude Code — add to .mcp.json:
 *   {
 *     "mcpServers": {
 *       "hashdo": {
 *         "command": "npx",
 *         "args": ["tsx", "/absolute/path/to/hashdo/v2/serve-demo.ts"]
 *       }
 *     }
 *   }
 */

import { serveMcp } from '@hashdo/mcp-adapter';

import cityExplorerCard from './demo-cards/city-explorer/card.js';
import pollCard from './demo-cards/poll/card.js';
import qrCodeCard from './demo-cards/qr-code/card.js';
import stockQuoteCard from './demo-cards/stock-quote/card.js';
import weatherCard from './demo-cards/weather/card.js';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  await serveMcp({
    name: 'hashdo',
    version: '2.0.0-alpha.1',
    cards: [weatherCard, stockQuoteCard, qrCodeCard, cityExplorerCard, pollCard],
    cardDirs: {
      'do-weather': join(__dirname, 'demo-cards/weather'),
      'do-stock': join(__dirname, 'demo-cards/stock-quote'),
      'do-qr': join(__dirname, 'demo-cards/qr-code'),
      'do-city': join(__dirname, 'demo-cards/city-explorer'),
      'do-poll': join(__dirname, 'demo-cards/poll'),
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
