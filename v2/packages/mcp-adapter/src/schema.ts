import { z } from 'zod';
import type { InputSchema, InputDefinition } from '@hashdo/core';

/**
 * Convert a HashDo input schema to a Zod raw shape,
 * which the MCP SDK expects for tool inputSchema.
 */
export function inputSchemaToZodShape(inputs: InputSchema): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, def] of Object.entries(inputs)) {
    shape[name] = inputDefToZod(def);
  }

  return shape;
}

function inputDefToZod(def: InputDefinition): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (def.type) {
    case 'number':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'json':
      schema = z.record(z.string(), z.unknown());
      break;
    case 'string':
    case 'date':
    case 'url':
    case 'email':
    default: {
      let strSchema = z.string();
      if (def.type === 'email') strSchema = strSchema.email();
      if (def.type === 'url') strSchema = strSchema.url();
      schema = strSchema;
      break;
    }
  }

  if (def.enum && def.enum.length > 0) {
    const literals = def.enum.map((v) => z.literal(v as string | number | boolean));
    schema = z.union([literals[0], literals[1] ?? literals[0], ...literals.slice(2)]);
  }

  // Add description
  if (def.description) {
    schema = schema.describe(def.description);
  }

  // Make optional if not required (with default if provided)
  if (!def.required) {
    if (def.default !== undefined) {
      schema = schema.optional().default(def.default as any);
    } else {
      schema = schema.optional();
    }
  }

  return schema;
}
