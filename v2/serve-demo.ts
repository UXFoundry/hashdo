#!/usr/bin/env npx tsx

/**
 * Demo: Run all demo cards as an MCP server.
 *
 * Usage:
 *   npx tsx serve-demo.ts          # Start MCP server (stdio)
 *
 * Add to claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "hashdo-demo": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/hashdo/v2/serve-demo.ts"]
 *       }
 *     }
 *   }
 */

import { serveMcp } from '@hashdo/mcp-adapter';

import qrCodeCard from './demo-cards/qr-code/card.js';
import stockQuoteCard from './demo-cards/stock-quote/card.js';
import weatherCard from './demo-cards/weather/card.js';

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  await serveMcp({
    name: 'hashdo-demo',
    version: '2.0.0-alpha.1',
    cards: [qrCodeCard, stockQuoteCard, weatherCard],
    cardDirs: {
      'qr-code': join(__dirname, 'demo-cards/qr-code'),
      'stock-quote': join(__dirname, 'demo-cards/stock-quote'),
      'weather': join(__dirname, 'demo-cards/weather'),
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
