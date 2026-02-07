/**
 * @hashdo/screenshot — Render HTML card snippets to PNG images.
 *
 * Uses puppeteer-core with a system-installed Chromium.
 * If Chromium is unavailable (e.g. local dev), functions degrade gracefully.
 */

import type { Browser, Page } from 'puppeteer-core';

let browser: Browser | null = null;
let launchFailed = false;

function getChromiumPath(): string {
  return (
    process.env['PUPPETEER_EXECUTABLE_PATH'] ??
    process.env['CHROMIUM_PATH'] ??
    '/usr/bin/chromium'
  );
}

async function getBrowser(): Promise<Browser | null> {
  if (browser) return browser;
  if (launchFailed) return null;

  try {
    const puppeteer = await import('puppeteer-core');
    browser = await puppeteer.default.launch({
      executablePath: getChromiumPath(),
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    // Clean up on process exit
    browser.on('disconnected', () => {
      browser = null;
    });

    return browser;
  } catch (err) {
    launchFailed = true;
    console.error(
      `[screenshot] Chromium not available — image rendering disabled. ${err instanceof Error ? err.message : err}`
    );
    return null;
  }
}

/**
 * Pre-launch Chromium so the first screenshot doesn't pay the cold-start cost.
 * Safe to call even if Chromium isn't installed — logs a warning and returns.
 */
export async function warmupBrowser(): Promise<void> {
  await getBrowser();
}

/**
 * Render an HTML snippet to a PNG image.
 *
 * Wraps the HTML in a minimal document, waits for external images to load,
 * then screenshots the `.hashdo-card` element (or the full page as fallback).
 *
 * Returns a PNG Buffer, or null if Chromium is unavailable.
 */
export async function renderHtmlToImage(
  html: string
): Promise<Buffer | null> {
  const b = await getBrowser();
  if (!b) return null;

  let page: Page | null = null;
  try {
    page = await b.newPage();
    await page.setViewport({
      width: 400,
      height: 800,
      deviceScaleFactor: 2,
    });

    const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      padding: 0;
    }
  </style>
</head>
<body>${html}</body>
</html>`;

    await page.setContent(wrappedHtml, { waitUntil: 'networkidle0', timeout: 8000 });

    // Try to screenshot just the card element, fallback to full page
    const card = await page.$('.hashdo-card');
    const target = card ?? page;

    const screenshot = await target.screenshot({
      type: 'png',
      omitBackground: true,
    });

    return Buffer.from(screenshot);
  } catch (err) {
    console.error(
      `[screenshot] Render failed: ${err instanceof Error ? err.message : err}`
    );
    return null;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Shut down the Chromium browser if running.
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
