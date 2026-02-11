#!/usr/bin/env node

/**
 * HashDo CLI
 *
 * Commands:
 *   hashdo serve [dir]    — Start MCP server exposing cards from directory
 *   hashdo preview [dir]  — Start HTTP preview server for card development
 *   hashdo list [dir]     — List all cards found in directory
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { type CardDefinition, type StateStore, renderCard, resolveInstance, prepareInputs } from '@hashdo/core';
import { serveMcp, handleMcpRequest } from '@hashdo/mcp-adapter';
import { warmupBrowser, renderHtmlToImage } from '@hashdo/screenshot';
import { generateOpenApiSpec } from './openapi.js';
import { createStateStore } from './create-state-store.js';

// ---------------------------------------------------------------------------
// Anonymous user ID (cookie-based)
// ---------------------------------------------------------------------------
const COOKIE_NAME = 'hd_uid';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

/** Read user ID from cookie, or generate a new one. Returns [userId, needsSet]. */
function resolveUserId(req: import('node:http').IncomingMessage): [string, boolean] {
  const cookieHeader = req.headers.cookie ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (match) return [match[1], false];
  return [randomUUID(), true];
}

/** Build the Set-Cookie header value. */
function makeSetCookie(userId: string): string {
  return `${COOKIE_NAME}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

// ---------------------------------------------------------------------------
// In-memory card usage tracking
// ---------------------------------------------------------------------------
const cardUsage: Record<string, { renders: number; lastUsed: string }> = {};

function trackCardUsage(cardName: string): void {
  if (!cardUsage[cardName]) {
    cardUsage[cardName] = { renders: 0, lastUsed: '' };
  }
  cardUsage[cardName].renders++;
  cardUsage[cardName].lastUsed = new Date().toISOString();
}

function getCardUsage(): Record<string, { renders: number; lastUsed: string }> {
  return { ...cardUsage };
}

/** Sort cards by usage (most used first), then alphabetically for ties. */
function sortCardsByUsage(cards: CardDefinition[]): CardDefinition[] {
  return [...cards].sort((a, b) => {
    const aRenders = cardUsage[a.name]?.renders ?? 0;
    const bRenders = cardUsage[b.name]?.renders ?? 0;
    if (bRenders !== aRenders) return bRenders - aRenders;
    return a.name.localeCompare(b.name);
  });
}

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
      let found = false;
      // Prefer card.js (compiled) over card.ts (source)
      for (const cardFile of ['card.js', 'card.ts']) {
        const cardPath = join(entryPath, cardFile);
        try {
          await stat(cardPath);
          const mod = await import(cardPath + cacheBuster);
          const cardDef = mod.default || mod;
          if (cardDef && cardDef.name && cardDef.inputs && cardDef.getData) {
            cards.push({ card: cardDef, dir: entryPath });
            found = true;
            break; // Don't load both .js and .ts
          }
        } catch {
          // Not a card directory, skip
        }
      }
      // Recurse into category folders (e.g. game/) that don't contain a card
      if (!found) {
        const nested = await discoverCards(entryPath, bustCache);
        cards.push(...nested);
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

  const stateStore = createStateStore();

  await serveMcp({
    name: 'hashdo-cards',
    version: '2.0.0-alpha.1',
    cards: discovered.map((d) => d.card),
    cardDirs,
    stateStore,
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

  const stateStore = createStateStore();
  const baseUrl = `http://localhost:${port}`;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const [userId, needsSetCookie] = resolveUserId(req);
    const cookieHeader = needsSetCookie ? { 'Set-Cookie': makeSetCookie(userId) } : {};

    // Re-discover cards on every request (hot reload)
    const discovered = await discoverCards(targetDir, true);
    const cardMap = new Map(discovered.map((d) => [d.card.name, d]));

    // Index page — list all cards
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...cookieHeader });
      res.end(renderIndex(sortCardsByUsage(discovered.map((d) => d.card))));
      return;
    }

    // Shared card (full screen, no inputs panel)
    const shareMatch = url.pathname.match(/^\/share\/([^/]+)\/([^/]+)$/);
    if (shareMatch) {
      const entry = cardMap.get(shareMatch[1]);
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Card not found: ${shareMatch[1]}`);
        return;
      }
      const instanceId = decodeURIComponent(shareMatch[2]);
      const inputs = await resolveShareInputs(entry.card, instanceId, stateStore);

      try {
        trackCardUsage(entry.card.name);
        const result = await renderCardWithState(entry.card, inputs, stateStore, entry.dir, baseUrl, userId);
        res.writeHead(200, { 'Content-Type': 'text/html', ...cookieHeader });
        res.end(renderSharePage(entry.card, result.html, baseUrl));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error rendering shared card: ${err.message}`);
      }
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
        trackCardUsage(entry.card.name);
        const result = await renderCardWithState(entry.card, inputs, stateStore, entry.dir, baseUrl, userId);

        res.writeHead(200, { 'Content-Type': 'text/html', ...cookieHeader });
        res.end(renderPreviewPage(entry.card, result.html, inputs, baseUrl));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error rendering card: ${err.message}`);
      }
      return;
    }

    // Developer docs
    if (url.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderDocsPage());
      return;
    }

    // Online card editor
    if (url.pathname === '/editor') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderEditorPage());
      return;
    }

    // Editor API: test card execution
    if (url.pathname === '/api/editor/test' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const code = body.code as string;
        const testInputs = (body.inputs ?? {}) as Record<string, unknown>;
        const result = await executeEditorCard(code, testInputs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Usage stats API
    if (url.pathname === '/api/cards/stats' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getCardUsage()));
      return;
    }

    // POST /api/cards/:name/action/:action — execute a card action
    const actionMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/action\/([^/]+)$/);
    if (actionMatch && req.method === 'POST') {
      const cardName = actionMatch[1];
      const actionName = actionMatch[2];
      const entry = cardMap.get(cardName);

      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Card not found: ${cardName}` }));
        return;
      }

      const action = entry.card.actions?.[actionName];
      if (!action) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Action not found: ${actionName} on ${cardName}` }));
        return;
      }

      let body: Record<string, unknown>;
      try {
        body = await readJsonBody(req);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON request body' }));
        return;
      }

      const cardInputs: Record<string, unknown> = {};
      const actionInputs: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(body)) {
        if (key in entry.card.inputs) {
          cardInputs[key] = val;
        } else {
          actionInputs[key] = val;
        }
      }

      const { cardKey } = resolveInstance(entry.card, cardInputs as any, userId);
      const state = (await stateStore.get(cardKey)) ?? {};

      try {
        const result = await action.handler({
          cardInputs: cardInputs as any,
          state,
          actionInputs,
        });

        if (result.state) {
          const newState = { ...state, ...result.state };
          await stateStore.set(cardKey, newState);
        }

        const responseState = result.state ?? state;
        res.writeHead(200, { 'Content-Type': 'application/json', ...cookieHeader });
        res.end(JSON.stringify({
          card: cardName,
          action: actionName,
          message: result.message ?? null,
          state: responseState,
        }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
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

/** Read and parse a JSON request body. Returns {} for empty bodies. */
function readJsonBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw || raw.trim() === '') { resolve({}); return; }
      try {
        const parsed = JSON.parse(raw);
        resolve(typeof parsed === 'object' && parsed !== null ? parsed : {});
      } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/** Parse query params with type coercion for numbers and booleans. */
function parseInputsFromParams(searchParams: URLSearchParams): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  for (const [key, value] of searchParams) {
    if (value === 'true') inputs[key] = true;
    else if (value === 'false') inputs[key] = false;
    else if (!isNaN(Number(value)) && value !== '') inputs[key] = Number(value);
    else inputs[key] = value;
  }
  return inputs;
}

/**
 * Resolve inputs for a share URL by looking up stored instance data,
 * falling back to heuristic resolution for backward compatibility.
 */
async function resolveShareInputs(
  card: CardDefinition,
  instanceId: string,
  store: StateStore,
): Promise<Record<string, unknown>> {
  // Primary: look up stored instance inputs
  const instanceKey = `share:${card.name}:${instanceId}`;
  const instanceMeta = await store.get(instanceKey);
  if (instanceMeta?._inputs) {
    return instanceMeta._inputs as Record<string, unknown>;
  }

  // Fallback heuristics for backward compat (cards rendered before this change)
  if ('id' in card.inputs) return { id: instanceId };
  if ('seed' in card.inputs) return { seed: instanceId };
  return {};
}

/** Render a card with state loaded from the store, and persist updated state + instance inputs. */
async function renderCardWithState(
  card: CardDefinition,
  inputs: Record<string, unknown>,
  store: StateStore,
  cardDir?: string,
  baseUrl?: string,
  userId?: string,
) {
  const prepared = prepareInputs(card, inputs);
  const { instanceId, cardKey } = resolveInstance(card, prepared as any, userId);

  const state = (await store.get(cardKey)) ?? {};
  const result = await renderCard(card, prepared as any, state, cardDir, { baseUrl, userId });

  if (result.state && Object.keys(result.state).length > 0) {
    await store.set(cardKey, result.state);
  }

  // Persist instance inputs so the /share route can resolve this instance
  const instanceKey = `share:${card.name}:${instanceId}`;
  await store.set(instanceKey, { _inputs: prepared });

  return result;
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

  // Pre-launch Chromium for screenshot rendering
  console.log('[hashdo] Warming up screenshot renderer...');
  await warmupBrowser();

  const stateStore = createStateStore();

  const mcpOptions = {
    name: 'hashdo-cards',
    version: '2.0.0-alpha.1',
    cards: discovered.map((d) => d.card),
    cardDirs,
    enableScreenshots: true,
    stateStore,
    baseUrl: process.env['BASE_URL'] ?? `http://localhost:${port}`,
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const [userId, needsSetCookie] = resolveUserId(req);
    const cookieHeader = needsSetCookie ? { 'Set-Cookie': makeSetCookie(userId) } : {};

    // MCP endpoint
    if (url.pathname === '/mcp') {
      // Streamable HTTP only accepts POST (and GET for SSE with sessions).
      // Return a helpful 405 for GET/HEAD so health-checks and URL validators
      // see the endpoint is alive rather than a confusing 406.
      if (req.method === 'GET' || req.method === 'HEAD') {
        res.writeHead(405, {
          Allow: 'POST',
          'Content-Type': 'application/json',
        });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'MCP endpoint accepts POST only. Send a JSON-RPC request with Accept: application/json, text/event-stream.' },
          id: null,
        }));
        return;
      }
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

    // --- REST API routes (for ChatGPT GPT Actions) ---

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // GET /api/openapi.json
    if (url.pathname === '/api/openapi.json' && req.method === 'GET') {
      const baseUrl = process.env['BASE_URL'] ?? `http://localhost:${port}`;
      const spec = generateOpenApiSpec(discovered, baseUrl);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(spec, null, 2));
      return;
    }

    // GET /api/cards
    if (url.pathname === '/api/cards' && req.method === 'GET') {
      const cardList = discovered.map(({ card }) => {
        const tag = card.name.startsWith('do-')
          ? `#do/${card.name.slice(3)}`
          : `#${card.name}`;
        return {
          name: card.name,
          tag,
          description: card.description,
          inputs: Object.fromEntries(
            Object.entries(card.inputs).map(([name, def]) => [
              name,
              { type: def.type, description: def.description, required: def.required ?? false },
            ])
          ),
        };
      });
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cardList));
      return;
    }

    // GET /api/cards/stats — usage statistics
    if (url.pathname === '/api/cards/stats' && req.method === 'GET') {
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getCardUsage()));
      return;
    }

    // GET /api/cards/:name/image?params — render card as PNG
    const imageMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/image$/);
    if (imageMatch && req.method === 'GET') {
      const entry = cardMap.get(imageMatch[1]);
      if (!entry) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Card not found: ${imageMatch[1]}` }));
        return;
      }
      try {
        trackCardUsage(entry.card.name);
        const inputs = parseInputsFromParams(url.searchParams);
        const result = await renderCardWithState(entry.card, inputs, stateStore, entry.dir, mcpOptions.baseUrl, userId);
        const imageBuffer = await renderHtmlToImage(result.html);
        if (!imageBuffer) {
          res.writeHead(503, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Screenshot renderer unavailable' }));
          return;
        }
        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': 'image/png',
          'Content-Length': String(imageBuffer.length),
          'Cache-Control': 'public, max-age=60',
        });
        res.end(imageBuffer);
      } catch (err: any) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // POST /api/cards/:name/action/:action — execute a card action, return JSON
    const actionMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/action\/([^/]+)$/);
    if (actionMatch && req.method === 'POST') {
      const cardName = actionMatch[1];
      const actionName = actionMatch[2];
      const entry = cardMap.get(cardName);

      if (!entry) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Card not found: ${cardName}` }));
        return;
      }

      const action = entry.card.actions?.[actionName];
      if (!action) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Action not found: ${actionName} on ${cardName}` }));
        return;
      }

      let body: Record<string, unknown>;
      try {
        body = await readJsonBody(req);
      } catch {
        res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON request body' }));
        return;
      }

      // Split body into card inputs vs action inputs (mirrors MCP adapter logic)
      const cardInputs: Record<string, unknown> = {};
      const actionInputs: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(body)) {
        if (key in entry.card.inputs) {
          cardInputs[key] = val;
        } else {
          actionInputs[key] = val;
        }
      }

      const { cardKey } = resolveInstance(entry.card, cardInputs as any, userId);
      const state = (await stateStore.get(cardKey)) ?? {};

      try {
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

        const responseState = result.state ?? state;
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          card: cardName,
          action: actionName,
          message: result.message ?? null,
          state: responseState,
        }));
      } catch (err: any) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // POST /api/cards/:name — execute card, return JSON
    const apiCardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)$/);
    if (apiCardMatch && req.method === 'POST') {
      const entry = cardMap.get(apiCardMatch[1]);
      if (!entry) {
        res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Card not found: ${apiCardMatch[1]}` }));
        return;
      }
      let inputs: Record<string, unknown>;
      try {
        inputs = await readJsonBody(req);
      } catch {
        res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON request body' }));
        return;
      }
      try {
        trackCardUsage(entry.card.name);
        const result = await renderCardWithState(entry.card, inputs, stateStore, entry.dir, mcpOptions.baseUrl, userId);
        const baseUrl = process.env['BASE_URL'] ?? `http://localhost:${port}`;
        const imageParams = new URLSearchParams();
        for (const [key, value] of Object.entries(inputs)) {
          if (value !== undefined && value !== null) imageParams.set(key, String(value));
        }
        imageParams.set('_t', String(Date.now()));
        const imageUrl = `${baseUrl}/api/cards/${entry.card.name}/image?${imageParams.toString()}`;
        res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ card: entry.card.name, text: result.textOutput ?? '', imageUrl }));
      } catch (err: any) {
        res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Favicon
    if (url.pathname === '/favicon.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
      res.end(FAVICON_SVG);
      return;
    }

    // Privacy policy
    if (url.pathname === '/privacy') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderLegalPage('Privacy Policy', PRIVACY_POLICY));
      return;
    }

    // Terms of service
    if (url.pathname === '/terms') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderLegalPage('Terms of Service', TERMS_OF_SERVICE));
      return;
    }

    // Developer docs
    if (url.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderDocsPage());
      return;
    }

    // Online card editor
    if (url.pathname === '/editor') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderEditorPage());
      return;
    }

    // Editor API: test card execution
    if (url.pathname === '/api/editor/test' && req.method === 'POST') {
      const editorCors: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      };
      try {
        const body = await readJsonBody(req);
        const code = body.code as string;
        const testInputs = (body.inputs ?? {}) as Record<string, unknown>;
        const result = await executeEditorCard(code, testInputs);
        res.writeHead(200, { ...editorCors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(200, { ...editorCors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Index page
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html', ...cookieHeader });
      res.end(renderIndex(sortCardsByUsage(discovered.map((d) => d.card))));
      return;
    }

    // Shared card (full screen, no inputs panel)
    const shareMatch = url.pathname.match(/^\/share\/([^/]+)\/([^/]+)$/);
    if (shareMatch) {
      const entry = cardMap.get(shareMatch[1]);
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Card not found: ${shareMatch[1]}`);
        return;
      }
      const instanceId = decodeURIComponent(shareMatch[2]);
      const inputs = await resolveShareInputs(entry.card, instanceId, stateStore);

      try {
        trackCardUsage(entry.card.name);
        const result = await renderCardWithState(entry.card, inputs, stateStore, entry.dir, mcpOptions.baseUrl, userId);
        res.writeHead(200, { 'Content-Type': 'text/html', ...cookieHeader });
        res.end(renderSharePage(entry.card, result.html, mcpOptions.baseUrl));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Error rendering shared card: ${err.message}`);
      }
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
        trackCardUsage(entry.card.name);
        const result = await renderCardWithState(entry.card, inputs, stateStore, entry.dir, mcpOptions.baseUrl, userId);
        res.writeHead(200, { 'Content-Type': 'text/html', ...cookieHeader });
        res.end(renderPreviewPage(entry.card, result.html, inputs, mcpOptions.baseUrl));
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
    console.log(`[hashdo] REST API: http://localhost:${port}/api/cards`);
    console.log(`[hashdo] OpenAPI spec: http://localhost:${port}/api/openapi.json`);
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
  const CARD_META: Record<string, { icon: string; color: string; glow: string; tag?: string }> = {
    'do-weather':    { icon: '\u26C5', color: '#0A84FF', glow: 'rgba(10,132,255,0.15)' },
    'do-stock':      { icon: '\uD83D\uDCC8', color: '#30D158', glow: 'rgba(48,209,88,0.15)' },
    'do-crypto':     { icon: '\uD83E\uDE99', color: '#FF9F0A', glow: 'rgba(255,159,10,0.15)' },
    'do-qr':         { icon: '\u2B21', color: '#BF5AF2', glow: 'rgba(191,90,242,0.15)' },
    'do-city':       { icon: '\uD83C\uDF0D', color: '#FF6B35', glow: 'rgba(255,107,53,0.15)' },
    'do-book':        { icon: '\uD83D\uDCDA', color: '#8B5CF6', glow: 'rgba(139,92,246,0.15)' },
    'do-poll':        { icon: '\uD83D\uDDF3\uFE0F', color: '#EC4899', glow: 'rgba(236,72,153,0.15)' },
    'do-define':      { icon: '\uD83D\uDCD6', color: '#14B8A6', glow: 'rgba(20,184,166,0.15)' },
    'do-repo':        { icon: '\uD83D\uDC19', color: '#6E7681', glow: 'rgba(110,118,129,0.15)' },
    'do-game-snake':  { icon: '\uD83D\uDC0D', color: '#4ade80', glow: 'rgba(74,222,128,0.15)', tag: '#do/game/snake' },
    'do-game-wordle': { icon: '\uD83D\uDFE9', color: '#538d4e', glow: 'rgba(83,141,78,0.15)', tag: '#do/game/wordle' },
    'do-game-zen-garden': { icon: '\uD83E\uDEA8', color: '#8B7355', glow: 'rgba(139,115,85,0.15)', tag: '#do/game/zen-garden' },
  };
  const fallbackMeta = { icon: '\u26A1', color: '#6b6b80', glow: 'rgba(107,107,128,0.15)' };

  const usage = getCardUsage();

  const cardList = cards.map((c, i) => {
    const meta = CARD_META[c.name] ?? fallbackMeta;
    const tag = meta.tag ?? (c.name.startsWith('do-') ? `#do/${c.name.slice(3)}` : `#${c.name}`);
    const desc = c.description.length > 100 ? c.description.slice(0, 97) + '...' : c.description;
    const inputNames = Object.keys(c.inputs).slice(0, 5);
    const chips = inputNames.map(n => `<span class="chip">${n}</span>`).join('');
    const actions = c.actions ? Object.keys(c.actions) : [];
    const renders = usage[c.name]?.renders ?? 0;
    const usageBadge = renders > 0 ? `<span class="chip chip-usage">${renders} use${renders !== 1 ? 's' : ''}</span>` : '';
    const searchData = `${tag} ${c.name} ${c.description} ${inputNames.join(' ')}`.toLowerCase();
    return `
      <a href="/card/${c.name}" class="card" data-search="${searchData}" style="--accent:${meta.color};--glow:${meta.glow};animation-delay:${i * 80}ms">
        <div class="card-accent"></div>
        <div class="card-head">
          <span class="card-icon">${meta.icon}</span>
          <code class="card-tag">${tag}</code>
        </div>
        <p class="card-desc">${desc}</p>
        <div class="card-chips">
          ${chips}
          ${actions.length ? `<span class="chip chip-act">${actions.length} action${actions.length > 1 ? 's' : ''}</span>` : ''}
          ${usageBadge}
        </div>
      </a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HashDo \u2014 Live Data Cards for AI</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#08080D;--surface:#111118;--surface-h:#191922;
      --bdr:rgba(255,255,255,0.10);--bdr-h:rgba(255,255,255,0.18);
      --text:#e4e4ec;--muted:#9d9db4;--dim:#6a6a82;
      --red:#F44336;--blue:#0A84FF;
      --font:'Outfit',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;
    }
    html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
    body{
      font-family:var(--font);background:var(--bg);color:var(--text);
      min-height:100vh;
      background-image:
        radial-gradient(ellipse 80% 60% at 25% 40%,rgba(10,132,255,0.06),transparent),
        radial-gradient(ellipse 60% 50% at 75% 60%,rgba(244,67,54,0.05),transparent);
    }
    main{max-width:960px;margin:0 auto;padding:80px 24px 60px}

    /* ── Hero ─────────────────────────────────────── */
    .hero{text-align:center;margin-bottom:64px}
    .logo{display:inline-block;margin-bottom:24px;filter:drop-shadow(0 0 40px rgba(10,132,255,0.2)) drop-shadow(0 0 40px rgba(244,67,54,0.15))}
    .logo svg{display:block}
    .hero h1{font-size:42px;font-weight:800;letter-spacing:-1.5px;margin-bottom:8px}
    .hero .sub{font-size:17px;color:var(--muted);font-weight:400;margin-bottom:6px}
    .hero .platforms{font-size:13px;color:var(--dim);font-weight:400;letter-spacing:0.5px;margin-bottom:32px}
    .terminal{
      display:inline-flex;align-items:center;gap:8px;
      background:var(--surface);border:1px solid var(--bdr);border-radius:10px;
      padding:12px 20px;font-family:var(--mono);font-size:14px;color:var(--muted);
    }
    .terminal .prompt{color:var(--blue);font-weight:500}
    .terminal .cmd{color:var(--text)}
    .terminal .cursor{display:inline-block;width:7px;height:17px;background:var(--blue);border-radius:1px;animation:blink 1s step-end infinite;vertical-align:text-bottom}
    @keyframes blink{50%{opacity:0}}

    /* ── Search ───────────────────────────────────── */
    .search-wrap{margin-bottom:24px}
    .search-input{
      width:100%;padding:12px 16px 12px 42px;
      background:var(--surface);border:1px solid var(--bdr);border-radius:10px;
      color:var(--text);font-family:var(--font);font-size:15px;
      outline:none;transition:border-color .2s;
    }
    .search-input::placeholder{color:var(--dim)}
    .search-input:focus{border-color:var(--blue)}
    .search-wrap{position:relative}
    .search-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--dim);pointer-events:none;font-size:16px}
    .no-results{text-align:center;color:var(--dim);padding:40px 0;font-size:15px;display:none}

    /* ── Top nav ──────────────────────────────────── */
    .top-nav{position:fixed;top:0;right:0;display:flex;gap:16px;padding:20px 24px;z-index:10}
    .nav-link{
      font-size:13px;font-weight:500;color:var(--muted);text-decoration:none;
      padding:6px 14px;border-radius:8px;border:1px solid var(--bdr);
      transition:all .2s;
    }
    .nav-link:hover{color:var(--text);border-color:var(--bdr-h);background:var(--surface)}

    /* ── Cards Grid ───────────────────────────────── */
    .cards-label{font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--dim);margin-bottom:20px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    @media(max-width:860px){.grid{grid-template-columns:1fr 1fr}}
    @media(max-width:560px){.grid{grid-template-columns:1fr}}

    .card{
      position:relative;overflow:hidden;
      display:flex;flex-direction:column;
      background:var(--surface);border:1px solid var(--bdr);border-radius:14px;
      padding:24px;text-decoration:none;color:var(--text);
      transition:all .3s cubic-bezier(.4,0,.2,1);
      animation:fadeUp .5s ease both;
    }
    .card.hidden{display:none}
    .card:hover{
      background:var(--surface-h);border-color:var(--accent);
      transform:translateY(-3px);
      box-shadow:0 12px 40px var(--glow),0 0 0 1px var(--accent);
    }
    .card-accent{position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent);opacity:.7;transition:opacity .3s}
    .card:hover .card-accent{opacity:1}
    .card-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
    .card-icon{font-size:24px;line-height:1}
    .card-tag{font-family:var(--mono);font-size:14px;font-weight:500;color:var(--accent);background:none;border:none;padding:0}
    .card-desc{font-size:14px;color:var(--muted);line-height:1.55;flex:1;margin-bottom:16px}
    .card-chips{display:flex;flex-wrap:wrap;gap:6px}
    .chip{
      font-family:var(--mono);font-size:11px;font-weight:400;
      color:var(--muted);background:rgba(255,255,255,0.06);
      padding:3px 8px;border-radius:5px;border:1px solid rgba(255,255,255,0.08);
    }
    .chip-act{color:var(--accent);border-color:rgba(255,255,255,0.1)}
    .chip-usage{color:var(--blue);border-color:rgba(10,132,255,0.2);background:rgba(10,132,255,0.08)}

    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}

    /* ── Footer ───────────────────────────────────── */
    footer{
      text-align:center;margin-top:56px;padding-top:28px;
      border-top:1px solid var(--bdr);
      font-size:13px;color:var(--dim);
    }
    footer a{color:var(--muted);text-decoration:none;transition:color .2s}
    footer a:hover{color:var(--text)}
    footer .dot{margin:0 10px;opacity:.4}
  </style>
</head>
<body>
  <nav class="top-nav">
    <a href="/docs" class="nav-link">Developer Docs</a>
    <a href="/editor" class="nav-link">Card Editor</a>
    <a href="https://github.com/shauntrennery/hashdo" class="nav-link">GitHub</a>
  </nav>
  <main>
    <section class="hero">
      <div class="logo">
        <svg viewBox="0 0 500 500" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
          <rect x="28" y="166" width="444" height="72" rx="36" fill="#0A84FF"/>
          <rect x="28" y="262" width="444" height="72" rx="36" fill="#0A84FF"/>
          <rect x="166" y="28" width="72" height="444" rx="36" fill="#F44336"/>
          <rect x="262" y="28" width="72" height="444" rx="36" fill="#F44336"/>
        </svg>
      </div>
      <h1>HashDo</h1>
      <p class="sub">Live data cards for AI conversations</p>
      <p class="platforms">Works with ChatGPT \u00B7 Claude \u00B7 VS Code</p>
      <div class="terminal">
        <span class="prompt">&gt;</span>
        <span class="cmd">#do/weather Tokyo</span>
        <span class="cursor"></span>
      </div>
    </section>

    <p class="cards-label">Available Cards</p>
    <div class="search-wrap">
      <span class="search-icon">\u2315</span>
      <input type="text" class="search-input" placeholder="Search cards by name, description, or inputs\u2026" id="cardSearch" autocomplete="off" />
    </div>
    <div class="grid" id="cardGrid">
      ${cardList}
    </div>
    <p class="no-results" id="noResults">No cards match your search.</p>

    <footer>
      <a href="/docs">Docs</a><span class="dot">\u00B7</span><a href="/editor">Editor</a><span class="dot">\u00B7</span><a href="/privacy">Privacy</a><span class="dot">\u00B7</span><a href="/terms">Terms</a><span class="dot">\u00B7</span><a href="https://github.com/shauntrennery/hashdo">GitHub</a>
    </footer>
  </main>
  <script>
    const search = document.getElementById('cardSearch');
    const grid = document.getElementById('cardGrid');
    const noResults = document.getElementById('noResults');
    search.addEventListener('input', function() {
      const q = this.value.toLowerCase().trim();
      const cards = grid.querySelectorAll('.card');
      let visible = 0;
      cards.forEach(function(card) {
        const data = card.getAttribute('data-search') || '';
        const match = !q || data.indexOf(q) !== -1;
        card.classList.toggle('hidden', !match);
        if (match) visible++;
      });
      noResults.style.display = visible === 0 ? 'block' : 'none';
    });
  </script>
</body>
</html>`;
}

function renderPreviewPage(
  card: CardDefinition,
  cardHtml: string,
  inputs: Record<string, unknown>,
  baseUrl?: string
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

  // Build Open Graph meta tags for social sharing
  let ogTags = '';
  if (baseUrl) {
    const queryParts = Object.entries(inputs)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const imageUrl = `${baseUrl}/api/cards/${encodeURIComponent(card.name)}/image${queryParts ? '?' + queryParts : ''}`;
    const cardUrl = `${baseUrl}/card/${encodeURIComponent(card.name)}${queryParts ? '?' + queryParts : ''}`;
    const description = card.description || `Interactive ${card.name} card on HashDo`;
    ogTags = `
  <meta property="og:type" content="website">
  <meta property="og:title" content="${card.name} — HashDo">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${cardUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${card.name} — HashDo">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${card.name} — HashDo Preview</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">${ogTags}
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
    .card-output .panel { background: transparent; box-shadow: none; }
    .inputs-section { order: 0; }
    .card-output { order: 1; }
    @media (max-width: 640px) {
      body { padding: 12px; }
      .container { grid-template-columns: 1fr; gap: 0; }
      .inputs-section { display: none; }
      .card-output { order: -1; }
      .card-output .panel { box-shadow: none; padding: 0; background: transparent; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="inputs-section">
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

/** Render a shared card as a full-screen page (no inputs panel). */
function renderSharePage(
  card: CardDefinition,
  cardHtml: string,
  baseUrl?: string
): string {
  const description = card.description || `Interactive ${card.name} card on HashDo`;

  let ogTags = '';
  if (baseUrl) {
    ogTags = `
  <meta property="og:type" content="website">
  <meta property="og:title" content="${card.name} — HashDo">
  <meta property="og:description" content="${description}">`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${card.name} — HashDo</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">${ogTags}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .share-container { width: 100%; max-width: 480px; }
    .hashdo-share-btn { display: none !important; }
  </style>
</head>
<body>
  <div class="share-container">
    ${cardHtml}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Developer docs page
// ---------------------------------------------------------------------------

function renderDocsPage(): string {
  const body = `
<p class="updated">HashDo Card Developer Guide</p>

<h2>What is a Card?</h2>
<p>A <strong>card</strong> is a self-contained, interactive UI component that fetches live data and renders it visually. Cards work as MCP tools in AI platforms (ChatGPT, Claude, VS Code) and as standalone HTML widgets.</p>

<h2>Quick Start</h2>
<p>Create a new directory for your card and add a <code>card.ts</code> (or <code>card.js</code>) file:</p>
<pre><code>my-cards/
  hello-world/
    card.ts       # Card definition
    main.hbs      # Optional: Handlebars template file</code></pre>

<h2>Card Definition</h2>
<p>Every card exports a <code>CardDefinition</code> object with these fields:</p>
<pre><code>import { defineCard } from '@hashdo/core';

export default defineCard({
  name: 'do-hello',
  description: 'A friendly greeting card',

  inputs: {
    name: {
      type: 'string',
      required: true,
      description: 'Name to greet',
    },
  },

  async getData({ inputs, state }) {
    return {
      viewModel: {
        greeting: \`Hello, \${inputs.name}!\`,
        visits: ((state.visits as number) || 0) + 1,
      },
      state: {
        visits: ((state.visits as number) || 0) + 1,
      },
      textOutput: \`Hello, \${inputs.name}!\`,
    };
  },

  template: (vm) =&gt; \`
    &lt;div style="padding:20px; font-family:system-ui;"&gt;
      &lt;h2&gt;\${vm.greeting}&lt;/h2&gt;
      &lt;p&gt;Visit #\${vm.visits}&lt;/p&gt;
    &lt;/div&gt;
  \`,
});</code></pre>

<h2>Card Fields Reference</h2>
<ul>
  <li><strong>name</strong> — Unique kebab-case identifier (convention: prefix with <code>do-</code>)</li>
  <li><strong>description</strong> — Human-readable text. LLMs use this for tool selection, so be descriptive.</li>
  <li><strong>inputs</strong> — Schema defining parameters the card accepts. Each input has: <code>type</code> (string, number, boolean, date, url, email, json), <code>description</code>, <code>required</code>, <code>default</code>, <code>enum</code>, <code>sensitive</code></li>
  <li><strong>getData(context)</strong> — Async function that fetches data and returns <code>{ viewModel, state, textOutput }</code></li>
  <li><strong>actions</strong> — Optional named operations users can trigger (e.g., "Toggle Units", "Add to Watchlist")</li>
  <li><strong>template</strong> — Either a function <code>(viewModel) =&gt; html</code> or a file path to a <code>.hbs</code>/<code>.html</code> template</li>
  <li><strong>onWebhook</strong> — Optional handler for incoming webhook events</li>
</ul>

<h2>Input Types</h2>
<ul>
  <li><code>string</code> — Text value (default)</li>
  <li><code>number</code> — Numeric value</li>
  <li><code>boolean</code> — True/false toggle</li>
  <li><code>date</code> — ISO date string</li>
  <li><code>url</code> — URL string</li>
  <li><code>email</code> — Email address</li>
  <li><code>json</code> — Arbitrary JSON object</li>
</ul>

<h2>Actions</h2>
<p>Actions let users (or AI agents) trigger operations on the card:</p>
<pre><code>actions: {
  toggleUnits: {
    label: 'Switch Units',
    description: 'Toggle between Celsius and Fahrenheit',
    permission: 'auto',  // auto | confirm | explicit
    async handler({ cardInputs, state, actionInputs }) {
      const next = state.units === 'celsius' ? 'fahrenheit' : 'celsius';
      return {
        state: { ...state, units: next },
        message: \`Switched to \${next}\`,
      };
    },
  },
}</code></pre>

<h2>Templates</h2>
<p>Cards can use inline template functions or external Handlebars files:</p>
<p><strong>Inline (recommended for simple cards):</strong></p>
<pre><code>template: (vm) =&gt; \`&lt;div&gt;\${vm.greeting}&lt;/div&gt;\`</code></pre>
<p><strong>Handlebars file:</strong></p>
<pre><code>template: 'main.hbs'  // Relative to card directory</code></pre>

<h2>State Management</h2>
<p>Cards persist state across renders. Return a <code>state</code> object from <code>getData()</code> and it will be passed back on subsequent renders via <code>context.state</code>. Use this for counters, preferences, cached data, etc.</p>

<h2>Text Output</h2>
<p>The <code>textOutput</code> field in <code>getData()</code> provides a plain-text or markdown summary for chat-based AI clients. This appears in the conversation alongside the rendered card visual.</p>

<h2>Testing Your Card</h2>
<ol>
  <li><strong>Preview server:</strong> Run <code>hashdo preview ./my-cards</code> and visit <code>http://localhost:3000</code></li>
  <li><strong>Online editor:</strong> Use the <a href="/editor">Card Editor</a> to prototype and test cards in the browser</li>
  <li><strong>MCP server:</strong> Run <code>hashdo serve ./my-cards</code> to test with Claude or VS Code</li>
</ol>

<h2>Directory Structure</h2>
<p>Cards are discovered by scanning a directory for subdirectories containing <code>card.ts</code> or <code>card.js</code>:</p>
<pre><code>my-cards/
  weather/
    card.ts          # Card definition (required)
    main.hbs         # Handlebars template (optional)
    icon.svg         # Card icon (optional)
  stock-quote/
    card.ts
  qr-code/
    card.ts</code></pre>

<h2>Submitting Cards</h2>
<ol>
  <li><strong>Fork</strong> the <a href="https://github.com/shauntrennery/hashdo">HashDo repository</a> on GitHub</li>
  <li><strong>Create</strong> your card directory under <code>v2/demo-cards/</code></li>
  <li><strong>Test</strong> locally with <code>hashdo preview</code></li>
  <li><strong>Submit</strong> a pull request with your card</li>
</ol>
<p>Card submission guidelines:</p>
<ul>
  <li>Use free, public APIs (no API keys required by default)</li>
  <li>Include a clear <code>description</code> for AI tool discovery</li>
  <li>Handle errors gracefully in <code>getData()</code></li>
  <li>Keep templates self-contained with inline styles</li>
  <li>Provide a <code>textOutput</code> for chat-based rendering</li>
</ul>

<h2>CLI Commands</h2>
<pre><code>hashdo serve [dir]     # Start MCP server (stdio)
hashdo preview [dir]   # HTTP preview server for development
hashdo start [dir]     # Production server (preview + MCP + REST API)
hashdo list [dir]      # List discovered cards</code></pre>

<h2>API Endpoints</h2>
<p>When running <code>hashdo start</code>, these REST endpoints are available:</p>
<ul>
  <li><code>GET /api/cards</code> — List all cards</li>
  <li><code>POST /api/cards/:name</code> — Execute a card with JSON body</li>
  <li><code>GET /api/cards/:name/image</code> — Render card as PNG</li>
  <li><code>GET /api/cards/stats</code> — Usage statistics</li>
  <li><code>GET /api/openapi.json</code> — OpenAPI spec for ChatGPT</li>
  <li><code>POST /mcp</code> — MCP protocol endpoint</li>
</ul>
`;
  return renderLegalPage('Developer Docs', body);
}

// ---------------------------------------------------------------------------
// Online card editor with test harness
// ---------------------------------------------------------------------------

function renderEditorPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Card Editor — HashDo</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#08080D;--surface:#101018;--surface-h:#191922;
      --bdr:rgba(255,255,255,0.06);--bdr-h:rgba(255,255,255,0.12);
      --text:#E8E8ED;--muted:#9A9AAF;--dim:#5C5C72;
      --accent:#0A84FF;--red:#F44336;--green:#30D158;
      --font:'Outfit',system-ui,sans-serif;--mono:'JetBrains Mono',monospace;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:var(--font);background:var(--bg);color:var(--text);
      min-height:100vh;
    }
    body::before{
      content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
      background:
        radial-gradient(ellipse 50% 40% at 25% 0%,rgba(244,67,54,0.06),transparent),
        radial-gradient(ellipse 50% 40% at 75% 0%,rgba(10,132,255,0.06),transparent);
    }

    .page{position:relative;z-index:1;max-width:1200px;margin:0 auto;padding:24px}

    /* Header */
    .header{display:flex;align-items:center;gap:14px;margin-bottom:24px}
    .header a{text-decoration:none;display:flex;align-items:center;gap:14px;color:var(--text);transition:opacity .2s}
    .header a:hover{opacity:.8}
    .wordmark{font-size:22px;font-weight:600;letter-spacing:-0.5px}
    .header-right{margin-left:auto;display:flex;gap:12px;align-items:center}
    .header-link{font-size:13px;color:var(--muted);text-decoration:none;transition:color .2s}
    .header-link:hover{color:var(--text)}

    /* Layout */
    .editor-layout{display:grid;grid-template-columns:1fr 1fr;gap:16px;height:calc(100vh - 120px)}
    @media(max-width:900px){.editor-layout{grid-template-columns:1fr;height:auto}}

    .panel{
      background:var(--surface);border:1px solid var(--bdr);border-radius:12px;
      display:flex;flex-direction:column;overflow:hidden;
    }
    .panel-header{
      display:flex;align-items:center;gap:10px;padding:12px 16px;
      border-bottom:1px solid var(--bdr);font-size:13px;font-weight:600;
      color:var(--muted);flex-shrink:0;
    }
    .panel-header .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

    /* Code editor */
    .code-area{
      flex:1;padding:0;border:none;resize:none;
      background:transparent;color:var(--text);
      font-family:var(--mono);font-size:13px;line-height:1.6;
      outline:none;overflow:auto;tab-size:2;padding:16px;
    }

    /* Controls */
    .controls{
      display:flex;gap:10px;padding:12px 16px;border-top:1px solid var(--bdr);
      flex-shrink:0;align-items:center;
    }
    .btn{
      padding:8px 18px;border-radius:8px;border:none;cursor:pointer;
      font-family:var(--font);font-size:13px;font-weight:500;
      transition:all .2s;
    }
    .btn-primary{background:var(--accent);color:white}
    .btn-primary:hover{background:#0977e5}
    .btn-secondary{background:rgba(255,255,255,0.06);color:var(--muted);border:1px solid var(--bdr)}
    .btn-secondary:hover{color:var(--text);border-color:var(--bdr-h)}
    .status{font-size:12px;color:var(--dim);margin-left:auto;font-family:var(--mono)}

    /* Test inputs */
    .inputs-section{padding:12px 16px;border-top:1px solid var(--bdr);flex-shrink:0}
    .inputs-section h4{font-size:12px;font-weight:600;color:var(--dim);margin-bottom:8px;text-transform:uppercase;letter-spacing:1px}
    .input-row{display:flex;gap:8px;margin-bottom:6px;align-items:center}
    .input-row input{
      flex:1;padding:6px 10px;border-radius:6px;border:1px solid var(--bdr);
      background:rgba(255,255,255,0.04);color:var(--text);font-family:var(--mono);font-size:12px;
      outline:none;
    }
    .input-row input:focus{border-color:var(--accent)}
    .input-row .input-name{min-width:80px;font-family:var(--mono);font-size:12px;color:var(--muted)}
    .add-input{
      font-size:12px;color:var(--accent);cursor:pointer;border:none;
      background:none;padding:4px 0;font-family:var(--font);
    }

    /* Output */
    .output-tabs{display:flex;gap:0;border-bottom:1px solid var(--bdr);flex-shrink:0}
    .tab{
      padding:10px 16px;font-size:12px;font-weight:500;color:var(--dim);
      cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;
      background:none;border-top:none;border-left:none;border-right:none;
    }
    .tab.active{color:var(--accent);border-bottom-color:var(--accent)}
    .tab:hover{color:var(--muted)}
    .output-content{flex:1;overflow:auto}
    .output-html{padding:16px}
    .output-json{
      padding:16px;font-family:var(--mono);font-size:12px;line-height:1.6;
      color:var(--muted);white-space:pre-wrap;word-break:break-word;
    }
    .output-error{padding:16px;color:var(--red);font-family:var(--mono);font-size:13px;line-height:1.6}
    .hidden{display:none}

    /* Log console */
    .log-panel{
      border-top:1px solid var(--bdr);max-height:150px;overflow:auto;
      padding:8px 16px;font-family:var(--mono);font-size:11px;line-height:1.7;
      color:var(--dim);flex-shrink:0;
    }
    .log-entry{border-bottom:1px solid rgba(255,255,255,0.03);padding:2px 0}
    .log-ok{color:var(--green)}
    .log-err{color:var(--red)}
    .log-info{color:var(--accent)}
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <a href="/">
        <svg viewBox="0 0 500 500" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
          <rect x="28" y="166" width="444" height="72" rx="36" fill="#0A84FF"/>
          <rect x="28" y="262" width="444" height="72" rx="36" fill="#0A84FF"/>
          <rect x="166" y="28" width="72" height="444" rx="36" fill="#F44336"/>
          <rect x="262" y="28" width="72" height="444" rx="36" fill="#F44336"/>
        </svg>
        <span class="wordmark">HashDo</span>
      </a>
      <div class="header-right">
        <a href="/docs" class="header-link">Docs</a>
        <a href="/" class="header-link">Home</a>
      </div>
    </div>

    <div class="editor-layout">
      <!-- Left: Code + Inputs -->
      <div class="panel">
        <div class="panel-header">
          <span class="dot" style="background:var(--red)"></span>
          <span class="dot" style="background:#FF9F0A"></span>
          <span class="dot" style="background:var(--green)"></span>
          card.ts — Card Editor
        </div>
        <textarea class="code-area" id="codeEditor" spellcheck="false">// HashDo Card Definition
// Edit this code and click "Run Card" to test

const card = {
  name: 'do-hello',
  description: 'A friendly greeting card',

  inputs: {
    name: {
      type: 'string',
      required: true,
      description: 'Name to greet',
    },
    color: {
      type: 'string',
      required: false,
      default: '#667eea',
      description: 'Background color',
    },
  },

  async getData({ inputs, state }) {
    const visits = ((state.visits) || 0) + 1;
    return {
      viewModel: {
        greeting: 'Hello, ' + inputs.name + '!',
        color: inputs.color || '#667eea',
        visits: visits,
      },
      state: { visits },
      textOutput: 'Hello, ' + inputs.name + '! (Visit #' + visits + ')',
    };
  },

  template: (vm) =>
    '&lt;div style="padding:24px;font-family:system-ui;background:' + vm.color + ';border-radius:12px;color:white;"&gt;' +
    '&lt;h2 style="margin:0 0 8px"&gt;' + vm.greeting + '&lt;/h2&gt;' +
    '&lt;p style="margin:0;opacity:0.85;font-size:14px"&gt;Visit #' + vm.visits + '&lt;/p&gt;' +
    '&lt;/div&gt;',
};

// Export for the test harness
card;</textarea>
        <div class="inputs-section">
          <h4>Test Inputs</h4>
          <div id="inputRows">
            <div class="input-row">
              <span class="input-name">name</span>
              <input type="text" data-key="name" value="World" placeholder="value" />
            </div>
            <div class="input-row">
              <span class="input-name">color</span>
              <input type="text" data-key="color" value="#667eea" placeholder="value" />
            </div>
          </div>
          <button class="add-input" id="addInput">+ Add input</button>
        </div>
        <div class="controls">
          <button class="btn btn-primary" id="runBtn">Run Card</button>
          <button class="btn btn-secondary" id="resetBtn">Reset</button>
          <span class="status" id="statusText"></span>
        </div>
      </div>

      <!-- Right: Output -->
      <div class="panel">
        <div class="panel-header">
          <span class="dot" style="background:var(--accent)"></span>
          Output
        </div>
        <div class="output-tabs">
          <button class="tab active" data-tab="preview">Preview</button>
          <button class="tab" data-tab="data">Data</button>
          <button class="tab" data-tab="text">Text Output</button>
        </div>
        <div class="output-content" id="outputContent">
          <div id="tabPreview" class="output-html">
            <p style="color:var(--dim);font-size:14px;padding:40px;text-align:center">Click "Run Card" to see the rendered output</p>
          </div>
          <div id="tabData" class="output-json hidden"></div>
          <div id="tabText" class="output-json hidden"></div>
        </div>
        <div class="log-panel" id="logPanel">
          <div class="log-entry log-info">Ready. Write a card definition and click Run Card to test.</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      var codeEditor = document.getElementById('codeEditor');
      var runBtn = document.getElementById('runBtn');
      var resetBtn = document.getElementById('resetBtn');
      var statusText = document.getElementById('statusText');
      var logPanel = document.getElementById('logPanel');
      var tabPreview = document.getElementById('tabPreview');
      var tabData = document.getElementById('tabData');
      var tabText = document.getElementById('tabText');
      var inputRows = document.getElementById('inputRows');
      var tabs = document.querySelectorAll('.tab');

      // Tab switching
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          tabs.forEach(function(t) { t.classList.remove('active'); });
          tab.classList.add('active');
          var target = tab.getAttribute('data-tab');
          tabPreview.classList.toggle('hidden', target !== 'preview');
          tabData.classList.toggle('hidden', target !== 'data');
          tabText.classList.toggle('hidden', target !== 'text');
        });
      });

      function log(msg, type) {
        var entry = document.createElement('div');
        entry.className = 'log-entry ' + (type || '');
        entry.textContent = new Date().toLocaleTimeString() + ' ' + msg;
        logPanel.appendChild(entry);
        logPanel.scrollTop = logPanel.scrollHeight;
      }

      function getInputs() {
        var inputs = {};
        inputRows.querySelectorAll('.input-row').forEach(function(row) {
          var inp = row.querySelector('input[data-key]');
          if (inp && inp.getAttribute('data-key')) {
            var v = inp.value;
            if (v === 'true') v = true;
            else if (v === 'false') v = false;
            else if (v !== '' && !isNaN(Number(v))) v = Number(v);
            inputs[inp.getAttribute('data-key')] = v;
          }
        });
        return inputs;
      }

      // Add input row
      document.getElementById('addInput').addEventListener('click', function() {
        var row = document.createElement('div');
        row.className = 'input-row';
        row.innerHTML = '<input type="text" style="max-width:80px" placeholder="key" class="input-key" />' +
          '<input type="text" data-key="" value="" placeholder="value" />';
        inputRows.appendChild(row);
        var keyInput = row.querySelector('.input-key');
        var valInput = row.querySelector('[data-key]');
        keyInput.addEventListener('input', function() {
          valInput.setAttribute('data-key', keyInput.value);
        });
      });

      // Handle Tab key in editor
      codeEditor.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
          e.preventDefault();
          var start = this.selectionStart;
          var end = this.selectionEnd;
          this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
          this.selectionStart = this.selectionEnd = start + 2;
        }
      });

      // Run card
      runBtn.addEventListener('click', function() {
        var code = codeEditor.value;
        var inputs = getInputs();
        statusText.textContent = 'Running...';
        log('Executing card...', 'log-info');

        fetch('/api/editor/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, inputs: inputs }),
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.error) {
            tabPreview.innerHTML = '<div class="output-error">' + data.error + '</div>';
            tabData.textContent = JSON.stringify(data, null, 2);
            tabText.textContent = '';
            statusText.textContent = 'Error';
            log('Error: ' + data.error, 'log-err');
            return;
          }

          // Show HTML preview
          tabPreview.innerHTML = data.html || '<p style="color:var(--dim)">No HTML output</p>';

          // Show data
          tabData.textContent = JSON.stringify(data, null, 2);

          // Show text output
          tabText.textContent = data.textOutput || '(no textOutput returned)';

          statusText.textContent = 'OK';
          log('Card rendered successfully. viewModel keys: ' + Object.keys(data.viewModel || {}).join(', '), 'log-ok');
        })
        .catch(function(err) {
          tabPreview.innerHTML = '<div class="output-error">' + err.message + '</div>';
          statusText.textContent = 'Error';
          log('Network error: ' + err.message, 'log-err');
        });
      });

      // Reset
      resetBtn.addEventListener('click', function() {
        tabPreview.innerHTML = '<p style="color:var(--dim);font-size:14px;padding:40px;text-align:center">Click "Run Card" to see the rendered output</p>';
        tabData.textContent = '';
        tabText.textContent = '';
        statusText.textContent = '';
        logPanel.innerHTML = '<div class="log-entry log-info">Editor reset.</div>';
      });

      // Ctrl+Enter to run
      document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          runBtn.click();
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Editor test harness — execute card code server-side
// ---------------------------------------------------------------------------

async function executeEditorCard(
  code: string,
  inputs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // We evaluate the card definition from user code in a sandboxed-ish way.
  // The code should assign or return a card definition object.
  // We wrap it in an async function to support top-level await patterns.

  let cardDef: any;

  try {
    // The editor code should end with `card;` or be a plain object.
    // We wrap in an async IIFE. To make the last expression the return
    // value, we prepend `return` to the final non-empty/non-comment line.
    const lines = code.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed && !trimmed.startsWith('//')) {
        if (!trimmed.startsWith('return ')) {
          lines[i] = lines[i].replace(trimmed, `return ${trimmed}`);
        }
        break;
      }
    }
    const wrappedCode = `(async () => { ${lines.join('\n')}\n })()`;
    cardDef = await eval(wrappedCode);
  } catch (err: any) {
    throw new Error(`Code evaluation failed: ${err.message}`);
  }

  if (!cardDef || typeof cardDef !== 'object') {
    throw new Error('Card code must return or evaluate to a card definition object. Make sure the last line is the card variable (e.g., `card;`).');
  }

  if (!cardDef.getData || typeof cardDef.getData !== 'function') {
    throw new Error('Card definition must have a getData() function.');
  }

  // Execute getData
  const state: Record<string, unknown> = {};
  let result: any;
  try {
    result = await cardDef.getData({ inputs, state });
  } catch (err: any) {
    throw new Error(`getData() failed: ${err.message}`);
  }

  if (!result || !result.viewModel) {
    throw new Error('getData() must return an object with a viewModel property.');
  }

  // Render template
  let html = '';
  if (cardDef.template) {
    if (typeof cardDef.template === 'function') {
      try {
        html = cardDef.template(result.viewModel);
        // Unescape HTML entities that were escaped in the editor textarea
        html = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      } catch (err: any) {
        throw new Error(`Template rendering failed: ${err.message}`);
      }
    } else {
      html = '<p style="color:#999">File-based templates cannot be tested in the editor. Use an inline template function instead.</p>';
    }
  }

  return {
    html,
    viewModel: result.viewModel,
    state: result.state ?? {},
    textOutput: result.textOutput ?? '',
    name: cardDef.name ?? 'untitled',
  };
}

// ---------------------------------------------------------------------------
// Legal pages
// ---------------------------------------------------------------------------

function renderLegalPage(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — HashDo</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#08080D;--surface:#101018;--bdr:rgba(255,255,255,0.06);
      --text:#E8E8ED;--muted:#9A9AAF;--dim:#5C5C72;
      --accent:#0A84FF;--red:#F44336;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Outfit',system-ui,-apple-system,sans-serif;
      background:var(--bg);color:var(--text);line-height:1.7;
      min-height:100vh;
    }

    /* ── Ambient glow ────────────────────────────── */
    body::before{
      content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
      background:
        radial-gradient(ellipse 50% 40% at 25% 0%, rgba(244,67,54,0.06) 0%, transparent 100%),
        radial-gradient(ellipse 50% 40% at 75% 0%, rgba(10,132,255,0.06) 0%, transparent 100%);
    }

    /* ── Layout ──────────────────────────────────── */
    .page{position:relative;z-index:1;max-width:680px;margin:0 auto;padding:48px 24px 64px}

    /* ── Header ──────────────────────────────────── */
    .header{display:flex;align-items:center;gap:14px;margin-bottom:40px}
    .header svg{flex-shrink:0;filter:drop-shadow(0 0 8px rgba(244,67,54,0.25)) drop-shadow(0 0 8px rgba(10,132,255,0.2))}
    .header a{
      text-decoration:none;display:flex;align-items:center;gap:14px;
      color:var(--text);transition:opacity .2s;
    }
    .header a:hover{opacity:.8}
    .wordmark{font-size:22px;font-weight:600;letter-spacing:-0.5px}

    /* ── Content card ────────────────────────────── */
    .card{
      background:var(--surface);border:1px solid var(--bdr);
      border-radius:16px;padding:40px 36px;
      box-shadow:0 1px 2px rgba(0,0,0,0.3);
    }
    .card h1{font-size:26px;font-weight:600;letter-spacing:-0.5px;margin-bottom:6px}
    .card h2{font-size:17px;font-weight:600;margin-top:32px;margin-bottom:10px;color:var(--text)}
    .card p,.card li{font-size:15px;color:var(--muted);margin-bottom:12px}
    .card ul{padding-left:22px}
    .card li::marker{color:var(--dim)}
    .card strong{color:var(--text);font-weight:500}
    .card a{color:var(--accent);text-decoration:none;border-bottom:1px solid rgba(10,132,255,0.3);transition:border-color .2s}
    .card a:hover{border-color:var(--accent)}
    .updated{color:var(--dim);font-size:13px;margin-bottom:28px}

    /* ── Footer ──────────────────────────────────── */
    .footer{
      text-align:center;margin-top:40px;
      font-size:13px;color:var(--dim);
    }
    .footer a{color:var(--muted);text-decoration:none;transition:color .2s}
    .footer a:hover{color:var(--text)}
    .footer .dot{margin:0 10px;opacity:.4}
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <a href="/">
        <svg viewBox="0 0 500 500" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
          <rect x="28" y="166" width="444" height="72" rx="36" fill="#0A84FF"/>
          <rect x="28" y="262" width="444" height="72" rx="36" fill="#0A84FF"/>
          <rect x="166" y="28" width="72" height="444" rx="36" fill="#F44336"/>
          <rect x="262" y="28" width="72" height="444" rx="36" fill="#F44336"/>
        </svg>
        <span class="wordmark">HashDo</span>
      </a>
    </div>
    <div class="card">
      <h1>${title}</h1>
      ${bodyHtml}
    </div>
    <div class="footer">
      <a href="/privacy">Privacy</a><span class="dot">\u00B7</span><a href="/terms">Terms</a><span class="dot">\u00B7</span><a href="/">Home</a>
    </div>
  </div>
</body>
</html>`;
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><rect x="28" y="166" width="444" height="72" rx="36" fill="#0A84FF"/><rect x="28" y="262" width="444" height="72" rx="36" fill="#0A84FF"/><rect x="166" y="28" width="72" height="444" rx="36" fill="#F44336"/><rect x="262" y="28" width="72" height="444" rx="36" fill="#F44336"/></svg>`;

const PRIVACY_POLICY = `
<p class="updated">Last updated: February 7, 2026</p>

<p>HashDo ("we", "us", "our") operates the HashDo card service. This policy describes what data we collect and how we use it.</p>

<h2>Data We Collect</h2>
<p>HashDo is designed to collect as little data as possible:</p>
<ul>
  <li><strong>Card inputs</strong> — Parameters you provide when using a card (e.g. a city name for weather, a stock ticker). These are processed in real-time and not stored permanently.</li>
  <li><strong>IP-based geolocation</strong> — When using the weather card without a city, your approximate location is inferred from your IP address via a third-party service (ip-api.com). We do not store your IP address.</li>
  <li><strong>Usage counts</strong> — We track how many times each card is used (aggregate only, not per-user) to sort the card list by popularity.</li>
</ul>

<h2>Data We Do Not Collect</h2>
<ul>
  <li>No user accounts or authentication</li>
  <li>No personal information (name, email, etc.)</li>
  <li>No cookies or tracking pixels</li>
  <li>No analytics or advertising SDKs</li>
</ul>

<h2>Third-Party Services</h2>
<p>Card data is fetched from third-party APIs. Each has its own privacy policy:</p>
<ul>
  <li><strong>Weather</strong> — <a href="https://open-meteo.com/en/terms">Open-Meteo</a> (weather data), <a href="https://ip-api.com/">ip-api.com</a> (geolocation)</li>
  <li><strong>Stocks</strong> — <a href="https://www.yahoo.com/privacy">Yahoo Finance</a></li>
  <li><strong>Crypto</strong> — <a href="https://www.coingecko.com/en/privacy">CoinGecko</a></li>
  <li><strong>City Explorer</strong> — <a href="https://restcountries.com">REST Countries</a> (country data)</li>
</ul>

<h2>Data Retention</h2>
<p>Card state (e.g. last weather check count) is stored in server memory and is lost when the server restarts. No data is persisted to disk or external databases.</p>

<h2>Children's Privacy</h2>
<p>HashDo does not knowingly collect data from children under 13.</p>

<h2>Changes</h2>
<p>We may update this policy from time to time. Changes will be reflected on this page with an updated date.</p>

<h2>Contact</h2>
<p>Questions? Reach us at <a href="https://github.com/shauntrennery/hashdo">github.com/shauntrennery/hashdo</a>.</p>
`;

const TERMS_OF_SERVICE = `
<p class="updated">Last updated: February 7, 2026</p>

<p>These terms govern your use of the HashDo card service ("Service") operated by HashDo ("we", "us", "our").</p>

<h2>Acceptance</h2>
<p>By using HashDo, you agree to these terms. If you do not agree, do not use the Service.</p>

<h2>What HashDo Does</h2>
<p>HashDo provides live data cards (weather, stock quotes, crypto prices, QR codes) that can be used within AI chat applications via the Model Context Protocol (MCP). The cards fetch data from third-party APIs and render visual results.</p>

<h2>No Warranty</h2>
<p>The Service is provided "as is" without warranty of any kind. We do not guarantee that:</p>
<ul>
  <li>The data displayed is accurate, complete, or current</li>
  <li>The Service will be available at all times or without interruption</li>
  <li>Third-party API data (weather, stock prices, crypto prices) is suitable for financial or critical decisions</li>
</ul>

<h2>Not Financial Advice</h2>
<p>Stock and cryptocurrency data is provided for informational purposes only. It is not financial advice. Do not make investment decisions based on data from HashDo.</p>

<h2>Acceptable Use</h2>
<p>You agree not to:</p>
<ul>
  <li>Use the Service for any unlawful purpose</li>
  <li>Attempt to overload, disrupt, or reverse-engineer the Service</li>
  <li>Use automated tools to scrape or abuse the Service beyond normal usage</li>
</ul>

<h2>Limitation of Liability</h2>
<p>To the maximum extent permitted by law, we are not liable for any damages arising from your use of the Service, including but not limited to inaccurate data, service downtime, or losses from decisions made using the Service.</p>

<h2>Changes</h2>
<p>We may update these terms at any time. Continued use of the Service after changes constitutes acceptance of the updated terms.</p>

<h2>Contact</h2>
<p>Questions? Reach us at <a href="https://github.com/shauntrennery/hashdo">github.com/shauntrennery/hashdo</a>.</p>
`;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
