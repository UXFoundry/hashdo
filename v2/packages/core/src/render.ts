import { createHash } from 'node:crypto';
import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { CardDefinition, InputSchema, InputValues, CardState } from './types.js';

/**
 * Render a card to HTML, given its inputs and current state.
 *
 * This is the core rendering pipeline:
 * 1. Call card's getData() with inputs + state
 * 2. Compile template with viewModel
 * 3. Return rendered HTML + updated state
 */
export async function renderCard<S extends InputSchema>(
  card: CardDefinition<S>,
  inputs: InputValues<S>,
  state: CardState,
  /** Absolute path to the directory containing the card (for resolving template files) */
  cardDir?: string,
  /** Runtime options forwarded to getData */
  options?: { baseUrl?: string }
): Promise<{ html: string; state: CardState; textOutput?: string; viewModel: Record<string, unknown> }> {
  // 1. Fetch data — defaults are applied by defineCard's getData wrapper
  let result;
  try {
    result = await card.getData({ inputs, rawInputs: inputs, state, baseUrl: options?.baseUrl ?? '' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorHtml = renderErrorCard(card.name, message);
    return {
      html: errorHtml,
      state,
      textOutput: `Error: ${message}`,
      viewModel: { _error: true, _errorMessage: message },
    };
  }

  const newState = { ...state, ...result.state };

  // 2. Resolve template
  let html: string;

  if (typeof card.template === 'function') {
    html = card.template(result.viewModel);
  } else {
    const templatePath = cardDir
      ? resolve(cardDir, card.template)
      : card.template;

    const templateSource = await readFile(templatePath, 'utf-8');
    const compiled = Handlebars.compile(templateSource);
    html = compiled(result.viewModel);
  }

  // 3. Compute share ID for shareable cards
  const shareId = computeShareId(card, inputs);
  const shareBar = shareId ? renderShareBar(card.name, shareId, options?.baseUrl) : '';

  // 4. Wrap in card container
  const wrappedHtml = `
<div class="hashdo-card" data-card="${card.name}"${shareId ? ` data-share-id="${shareId}"` : ''}>
  ${shareBar}${html}
</div>`.trim();

  return { html: wrappedHtml, state: newState, textOutput: result.textOutput, viewModel: result.viewModel };
}

/**
 * Compute a short share ID for a shareable card.
 * Uses stateKey if available, otherwise hashes the inputs.
 */
function computeShareId<S extends InputSchema>(
  card: CardDefinition<S>,
  inputs: InputValues<S>
): string | undefined {
  if (!card.shareable) return undefined;

  if (card.stateKey) {
    const key = card.stateKey(inputs);
    if (key) {
      // Extract the value portion (after last colon) e.g. "id:71a1bc" → "71a1bc"
      const colonIdx = key.lastIndexOf(':');
      return colonIdx >= 0 ? key.slice(colonIdx + 1) : key;
    }
  }

  // Fallback: 6-char hex hash of sorted inputs
  const sorted = Object.keys(inputs as Record<string, unknown>)
    .sort()
    .map((k) => `${k}=${(inputs as Record<string, unknown>)[k]}`)
    .join('&');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 6);
}

/** Render the share bar injected at the top of shareable cards. */
function renderShareBar(cardName: string, shareId: string, baseUrl?: string): string {
  const shareUrl = baseUrl
    ? `${baseUrl}/share/${encodeURIComponent(cardName)}/${encodeURIComponent(shareId)}`
    : `#`;
  const linkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  return `
  <div class="hashdo-share-bar" style="display:flex;align-items:center;justify-content:flex-end;padding:6px 12px;background:#f9fafb;border-bottom:1px solid #f3f4f6;">
    <a href="${shareUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-family:'SF Mono',ui-monospace,monospace;font-size:11px;font-weight:500;color:#6b7280;background:#fff;border:1px solid #e5e7eb;padding:3px 8px;border-radius:6px;text-decoration:none;letter-spacing:.04em;transition:all .15s;" onmouseover="this.style.color='#6366f1';this.style.borderColor='#6366f1'" onmouseout="this.style.color='#6b7280';this.style.borderColor='#e5e7eb'">${linkSvg} ${shareId}</a>
  </div>`;
}

/** Render a styled error card when getData fails. */
function renderErrorCard(cardName: string, message: string): string {
  const tag = cardName.startsWith('do-') ? `#do/${cardName.slice(3)}` : `#${cardName}`;
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
<div class="hashdo-card" data-card="${cardName}">
  <div style="font-family:'SF Pro Display',system-ui,-apple-system,sans-serif;max-width:400px;border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="padding:24px 24px 20px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2" opacity="0.85"/>
          <line x1="12" y1="8" x2="12" y2="13" stroke="white" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="16.5" r="1" fill="white"/>
        </svg>
        <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;opacity:.85;">Error</span>
        <span style="margin-left:auto;font-family:'SF Mono',monospace;font-size:11px;font-weight:500;background:rgba(255,255,255,.2);padding:3px 8px;border-radius:6px;">${tag}</span>
      </div>
      <div style="font-size:18px;font-weight:700;line-height:1.3;">Something went wrong</div>
    </div>
    <div style="padding:20px 24px;">
      <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0;">${escaped}</p>
    </div>
  </div>
</div>`.trim();
}
