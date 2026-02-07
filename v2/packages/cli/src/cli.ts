#!/usr/bin/env node

/**
 * HashDo CLI
 *
 * Commands:
 *   hashdo serve [dir]    — Start MCP server exposing cards from directory
 *   hashdo preview [dir]  — Start HTTP preview server for card development
 *   hashdo list [dir]     — List all cards found in directory
 */

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { type CardDefinition, renderCard } from '@hashdo/core';
import { serveMcp, handleMcpRequest } from '@hashdo/mcp-adapter';

const args = process.argv.slice(2);
const command = args[0] || 'serve';
const targetDir = resolve(args[1] || '.');

async function main() {
  switch (command) {
    case 'serve':
      await cmdServe();
      break;
    case 'preview':
      await cmdPreview();
      break;
    case 'start':
      await cmdStart();
      break;
    case 'list':
      await cmdList();
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
HashDo CLI v2 — Actionable cards for the AI age

Usage:
  hashdo serve [dir]     Start MCP server (stdio) exposing cards as tools
  hashdo preview [dir]   Start HTTP server for card preview/development
  hashdo start [dir]     Start production server (preview + MCP over HTTP)
  hashdo list [dir]      List discovered cards

Options:
  --port <n>             Port for preview/start server (default: 3000, or PORT env)
  --help                 Show this help message

Examples:
  hashdo serve ./demo-cards          # Expose demo cards as MCP tools (stdio)
  hashdo preview ./demo-cards        # Preview cards in browser at :3000
  hashdo start ./demo-cards          # Production server with MCP at /mcp
  hashdo list ./demo-cards           # List available cards
`);
}

/**
 * Discover card modules from a directory.
 * Looks for directories containing card.ts or card.js files.
 */
async function discoverCards(
  dir: string,
  bustCache = false
): Promise<{ card: CardDefinition; dir: string }[]> {
  const cards: { card: CardDefinition; dir: string }[] = [];
  const entries = await readdir(dir);
  const cacheBuster = bustCache ? `?t=${Date.now()}` : '';

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    const entryStat = await stat(entryPath);

    if (entryStat.isDirectory()) {
      // Prefer card.js (compiled) over card.ts (source)
      for (const cardFile of ['card.js', 'card.ts']) {
        const cardPath = join(entryPath, cardFile);
        try {
          await stat(cardPath);
          const mod = await import(cardPath + cacheBuster);
          const cardDef = mod.default || mod;
          if (cardDef && cardDef.name && cardDef.inputs && cardDef.getData) {
            cards.push({ card: cardDef, dir: entryPath });
            break; // Don't load both .js and .ts
          }
        } catch {
          // Not a card directory, skip
        }
      }
    }
  }

  return cards;
}

async function cmdServe() {
  const discovered = await discoverCards(targetDir);

  if (discovered.length === 0) {
    console.error(`No cards found in ${targetDir}`);
    process.exit(1);
  }

  const cardDirs: Record<string, string> = {};
  for (const { card, dir } of discovered) {
    cardDirs[card.name] = dir;
  }

  console.error(
    `[hashdo] Starting MCP server with ${discovered.length} card(s):`
  );
  for (const { card } of discovered) {
    console.error(`  - ${card.name}: ${card.description}`);
  }

  await serveMcp({
    name: 'hashdo-cards',
    version: '2.0.0-alpha.1',
    cards: discovered.map((d) => d.card),
    cardDirs,
  });
}

async function cmdPreview() {
  const port = parseInt(
    args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? '3000',
    10
  );

  // Initial discovery to validate the directory
  const initial = await discoverCards(targetDir);

  if (initial.length === 0) {
    console.error(`No cards found in ${targetDir}`);
    process.exit(1);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // Re-discover cards on every request (hot reload)
    const discovered = await discoverCards(targetDir, true);
    const cardMap = new Map(discovered.map((d) => [d.card.name, d]));

    // Index page — list all cards
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderIndex(discovered.map((d) => d.card)));
      return;
    }

    // Card preview — /card/:name?param=value
    const cardMatch = url.pathname.match(/^\/card\/(.+)$/);
    if (cardMatch) {
      const cardName = cardMatch[1];
      const entry = cardMap.get(cardName);

      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Card not found: ${cardName}`);
        return;
      }

      // Parse inputs from query string
      const inputs: Record<string, unknown> = {};
      for (const [key, value] of url.searchParams) {
        // Try to parse numbers and booleans
        if (value === 'true') inputs[key] = true;
        else if (value === 'false') inputs[key] = false;
        else if (!isNaN(Number(value)) && value !== '') inputs[key] = Number(value);
        else inputs[key] = value;
      }

      try {
        const result = await renderCard(
          entry.card,
          inputs as any,
          {},
          entry.dir
        );

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderPreviewPage(entry.card, result.html, inputs));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error rendering card: ${err.message}`);
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`[hashdo] Preview server running at http://localhost:${port}`);
    console.log(`[hashdo] ${initial.length} card(s) available:`);
    for (const { card } of initial) {
      console.log(`  - http://localhost:${port}/card/${card.name}`);
    }
  });
}

async function cmdStart() {
  const port = parseInt(
    process.env.PORT ??
      args.find((a) => a.startsWith('--port='))?.split('=')[1] ??
      '3000',
    10
  );

  const discovered = await discoverCards(targetDir);

  if (discovered.length === 0) {
    console.error(`No cards found in ${targetDir}`);
    process.exit(1);
  }

  const cardMap = new Map(discovered.map((d) => [d.card.name, d]));
  const cardDirs: Record<string, string> = {};
  for (const { card, dir } of discovered) {
    cardDirs[card.name] = dir;
  }

  const mcpOptions = {
    name: 'hashdo-cards',
    version: '2.0.0-alpha.1',
    cards: discovered.map((d) => d.card),
    cardDirs,
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // MCP endpoint
    if (url.pathname === '/mcp') {
      try {
        await handleMcpRequest(mcpOptions, req, res);
      } catch (err: any) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      return;
    }

    // Index page
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderIndex(discovered.map((d) => d.card)));
      return;
    }

    // Card preview
    const cardMatch = url.pathname.match(/^\/card\/(.+)$/);
    if (cardMatch) {
      const entry = cardMap.get(cardMatch[1]);
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Card not found: ${cardMatch[1]}`);
        return;
      }

      const inputs: Record<string, unknown> = {};
      for (const [key, value] of url.searchParams) {
        if (value === 'true') inputs[key] = true;
        else if (value === 'false') inputs[key] = false;
        else if (!isNaN(Number(value)) && value !== '') inputs[key] = Number(value);
        else inputs[key] = value;
      }

      try {
        const result = await renderCard(entry.card, inputs as any, {}, entry.dir);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderPreviewPage(entry.card, result.html, inputs));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error rendering card: ${err.message}`);
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(port, () => {
    console.log(`[hashdo] Production server running at http://localhost:${port}`);
    console.log(`[hashdo] MCP endpoint: http://localhost:${port}/mcp`);
    console.log(`[hashdo] ${discovered.length} card(s) available:`);
    for (const { card } of discovered) {
      console.log(`  - http://localhost:${port}/card/${card.name}`);
    }
  });
}

async function cmdList() {
  const discovered = await discoverCards(targetDir);

  if (discovered.length === 0) {
    console.log(`No cards found in ${targetDir}`);
    return;
  }

  console.log(`Found ${discovered.length} card(s) in ${targetDir}:\n`);
  for (const { card, dir } of discovered) {
    console.log(`  ${card.name}`);
    console.log(`    ${card.description}`);
    console.log(`    Inputs: ${Object.keys(card.inputs).join(', ')}`);
    if (card.actions) {
      console.log(`    Actions: ${Object.keys(card.actions).join(', ')}`);
    }
    console.log(`    Path: ${dir}`);
    console.log();
  }
}

function renderIndex(cards: CardDefinition[]): string {
  const cardList = cards
    .map(
      (c) => `
    <a href="/card/${c.name}" class="card-link">
      <div class="card-item">
        <h2>${c.name}</h2>
        <p>${c.description}</p>
        <div class="meta">
          <span>Inputs: ${Object.keys(c.inputs).join(', ')}</span>
          ${c.actions ? `<span>Actions: ${Object.keys(c.actions).join(', ')}</span>` : ''}
        </div>
      </div>
    </a>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HashDo Card Preview</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; padding: 40px 20px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #666; margin-bottom: 32px; }
    .card-link { text-decoration: none; color: inherit; }
    .card-item {
      background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: box-shadow 0.2s;
    }
    .card-item:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .card-item h2 { font-size: 18px; margin-bottom: 8px; color: #333; }
    .card-item p { color: #666; font-size: 14px; margin-bottom: 12px; }
    .meta { font-size: 12px; color: #999; }
    .meta span { margin-right: 16px; }
    .container { max-width: 640px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>#do Cards</h1>
    <p class="subtitle">${cards.length} card${cards.length !== 1 ? 's' : ''} available</p>
    ${cardList}
  </div>
</body>
</html>`;
}

function renderPreviewPage(
  card: CardDefinition,
  cardHtml: string,
  inputs: Record<string, unknown>
): string {
  const inputFields = Object.entries(card.inputs)
    .map(([name, def]) => {
      const value = inputs[name] ?? def.default ?? '';
      const inputType =
        def.type === 'number'
          ? 'number'
          : def.type === 'boolean'
            ? 'checkbox'
            : 'text';
      return `
      <div class="field">
        <label>${name}${def.required ? ' *' : ''}</label>
        <input type="${inputType}" name="${name}" value="${value}"
               placeholder="${def.description}" />
        <span class="desc">${def.description}</span>
      </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${card.name} — HashDo Preview</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; padding: 40px 20px; }
    .container { max-width: 800px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .back { color: #666; text-decoration: none; font-size: 14px; display: block; margin-bottom: 16px; }
    .panel { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .field input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
    .field .desc { font-size: 11px; color: #999; margin-top: 2px; display: block; }
    .render-btn { background: #333; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .render-btn:hover { background: #555; }
    .card-output { display: flex; justify-content: center; align-items: flex-start; }
    @media (max-width: 640px) { .container { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <div>
      <a href="/" class="back">&larr; All Cards</a>
      <div class="panel">
        <h1>${card.name}</h1>
        <p style="color:#666; font-size:13px; margin-bottom:20px;">${card.description}</p>
        <form method="GET" action="/card/${card.name}">
          ${inputFields}
          <button type="submit" class="render-btn">Render Card</button>
        </form>
      </div>
    </div>
    <div class="card-output">
      <div class="panel">
        ${cardHtml}
      </div>
    </div>
  </div>
</body>
</html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
