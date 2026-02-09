import type { CardDefinition, InputSchema, InputValues } from './types.js';

/**
 * Define a HashDo card.
 *
 * This is the primary API for card authors. It provides type inference
 * so that `getData`, `actions`, and `onWebhook` all have correctly
 * typed input values based on the declared input schema.
 *
 * Handles default values: wraps `getData` so that `inputs` contains
 * resolved values (with defaults applied) while `rawInputs` preserves
 * the original caller-provided values. Cards can use `rawInputs` to
 * distinguish explicit input from schema defaults.
 *
 * @example
 * ```ts
 * export default defineCard({
 *   name: 'temperature',
 *   description: 'Shows current temperature for a location',
 *   inputs: {
 *     city: { type: 'string', required: true, description: 'City name' },
 *   },
 *   async getData({ inputs, rawInputs }) {
 *     // inputs.city has defaults applied; rawInputs.city is undefined if not provided
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
  const originalGetData = definition.getData;

  return {
    ...definition,
    getData: async (context) => {
      // Preserve the original inputs before applying defaults
      const rawInputs = (context.rawInputs ?? context.inputs) as Partial<InputValues<S>>;

      // Apply schema defaults for any missing inputs
      const resolvedInputs = { ...context.inputs } as Record<string, unknown>;
      for (const [key, def] of Object.entries(definition.inputs)) {
        if (resolvedInputs[key] === undefined && def.default !== undefined) {
          resolvedInputs[key] = def.default;
        }
      }

      // Validate required inputs (after defaults, since a required input could have a default)
      const missing = Object.entries(definition.inputs)
        .filter(([key, def]) => def.required && resolvedInputs[key] === undefined)
        .map(([key]) => key);
      if (missing.length > 0) {
        throw new Error(
          `Missing required input${missing.length > 1 ? 's' : ''} for "${definition.name}": ${missing.join(', ')}`,
        );
      }

      return originalGetData({
        ...context,
        inputs: resolvedInputs as InputValues<S>,
        rawInputs,
      });
    },
  };
}
