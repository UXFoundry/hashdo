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
  cardDir?: string
): Promise<{ html: string; state: CardState; textOutput?: string }> {
  // 1. Fetch data
  const result = await card.getData({ inputs, state });
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

  // 3. Wrap in card container
  const wrappedHtml = `
<div class="hashdo-card" data-card="${card.name}">
  ${html}
</div>`.trim();

  return { html: wrappedHtml, state: newState, textOutput: result.textOutput };
}
