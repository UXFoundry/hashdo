import type { CardDefinition, InputSchema } from './types.js';

/**
 * Define a HashDo card.
 *
 * This is the primary API for card authors. It provides type inference
 * so that `getData`, `actions`, and `onWebhook` all have correctly
 * typed input values based on the declared input schema.
 *
 * @example
 * ```ts
 * export default defineCard({
 *   name: 'temperature',
 *   description: 'Shows current temperature for a location',
 *   inputs: {
 *     city: { type: 'string', required: true, description: 'City name' },
 *   },
 *   async getData({ inputs }) {
 *     // inputs.city is typed as string
 *     const data = await fetchWeather(inputs.city);
 *     return { viewModel: { temp: data.temp } };
 *   },
 *   template: 'temperature.hbs',
 * });
 * ```
 */
export function defineCard<S extends InputSchema>(
  definition: CardDefinition<S>
): CardDefinition<S> {
  return definition;
}
