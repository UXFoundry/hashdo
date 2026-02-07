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
import { warmupBrowser, renderHtmlToImage } from '@hashdo/screenshot';
import { generateOpenApiSpec } from './openapi.js';

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

  const mcpOptions = {
    name: 'hashdo-cards',
    version: '2.0.0-alpha.1',
    cards: discovered.map((d) => d.card),
    cardDirs,
    enableScreenshots: true,
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
        const inputs = parseInputsFromParams(url.searchParams);
        const result = await renderCard(entry.card, inputs as any, {}, entry.dir);
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
        const result = await renderCard(entry.card, inputs as any, {}, entry.dir);
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
  const CARD_META: Record<string, { icon: string; color: string; glow: string }> = {
    'do-weather': { icon: '\u26C5', color: '#0A84FF', glow: 'rgba(10,132,255,0.15)' },
    'do-stock':   { icon: '\uD83D\uDCC8', color: '#30D158', glow: 'rgba(48,209,88,0.15)' },
    'do-crypto':  { icon: '\uD83E\uDE99', color: '#FF9F0A', glow: 'rgba(255,159,10,0.15)' },
    'do-qr':      { icon: '\u2B21', color: '#BF5AF2', glow: 'rgba(191,90,242,0.15)' },
  };
  const fallbackMeta = { icon: '\u26A1', color: '#6b6b80', glow: 'rgba(107,107,128,0.15)' };

  const cardList = cards.map((c, i) => {
    const meta = CARD_META[c.name] ?? fallbackMeta;
    const tag = c.name.startsWith('do-') ? `#do/${c.name.slice(3)}` : `#${c.name}`;
    const desc = c.description.length > 100 ? c.description.slice(0, 97) + '...' : c.description;
    const inputNames = Object.keys(c.inputs).slice(0, 5);
    const chips = inputNames.map(n => `<span class="chip">${n}</span>`).join('');
    const actions = c.actions ? Object.keys(c.actions) : [];
    return `
      <a href="/card/${c.name}" class="card" style="--accent:${meta.color};--glow:${meta.glow};animation-delay:${i * 80}ms">
        <div class="card-accent"></div>
        <div class="card-head">
          <span class="card-icon">${meta.icon}</span>
          <code class="card-tag">${tag}</code>
        </div>
        <p class="card-desc">${desc}</p>
        <div class="card-chips">
          ${chips}
          ${actions.length ? `<span class="chip chip-act">${actions.length} action${actions.length > 1 ? 's' : ''}</span>` : ''}
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
      --bdr:rgba(255,255,255,0.06);--bdr-h:rgba(255,255,255,0.1);
      --text:#e4e4ec;--muted:#7a7a90;--dim:#44445a;
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
    main{max-width:700px;margin:0 auto;padding:80px 24px 60px}

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

    /* ── Cards Grid ───────────────────────────────── */
    .cards-label{font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--dim);margin-bottom:20px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    @media(max-width:560px){.grid{grid-template-columns:1fr}}

    .card{
      position:relative;overflow:hidden;
      display:flex;flex-direction:column;
      background:var(--surface);border:1px solid var(--bdr);border-radius:14px;
      padding:24px;text-decoration:none;color:var(--text);
      transition:all .3s cubic-bezier(.4,0,.2,1);
      animation:fadeUp .5s ease both;
    }
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
    <div class="grid">
      ${cardList}
    </div>

    <footer>
      <a href="/privacy">Privacy</a><span class="dot">\u00B7</span><a href="/terms">Terms</a><span class="dot">\u00B7</span><a href="https://github.com/UXFoundry/hashdo">GitHub</a>
    </footer>
  </main>
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
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
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
</ul>

<h2>Data Retention</h2>
<p>Card state (e.g. last weather check count) is stored in server memory and is lost when the server restarts. No data is persisted to disk or external databases.</p>

<h2>Children's Privacy</h2>
<p>HashDo does not knowingly collect data from children under 13.</p>

<h2>Changes</h2>
<p>We may update this policy from time to time. Changes will be reflected on this page with an updated date.</p>

<h2>Contact</h2>
<p>Questions? Reach us at <a href="https://github.com/UXFoundry/hashdo">github.com/UXFoundry/hashdo</a>.</p>
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
<p>Questions? Reach us at <a href="https://github.com/UXFoundry/hashdo">github.com/UXFoundry/hashdo</a>.</p>
`;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
