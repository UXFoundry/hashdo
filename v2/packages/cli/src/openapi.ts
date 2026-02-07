/**
 * Auto-generate an OpenAPI 3.1.0 spec from HashDo card definitions.
 * Used by ChatGPT Custom GPT Actions to discover and call card endpoints.
 */

import type { CardDefinition, InputDefinition, InputType } from '@hashdo/core';

interface CardEntry {
  card: CardDefinition;
  dir: string;
}

function inputTypeToJsonSchema(type: InputType): { type: string; format?: string } {
  switch (type) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date' };
    case 'url':
      return { type: 'string', format: 'uri' };
    case 'email':
      return { type: 'string', format: 'email' };
    case 'json':
      return { type: 'object' };
    default:
      return { type: 'string' };
  }
}

function buildInputProperties(inputs: Record<string, InputDefinition>) {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const [name, def] of Object.entries(inputs)) {
    const prop: Record<string, unknown> = {
      ...inputTypeToJsonSchema(def.type),
      description: def.description,
    };
    if (def.enum) prop.enum = [...def.enum];
    if (def.default !== undefined) prop.default = def.default;
    properties[name] = prop;
    if (def.required) required.push(name);
  }

  return { properties, required };
}

export function generateOpenApiSpec(
  cards: CardEntry[],
  baseUrl: string
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  // GET /api/cards — list all cards
  paths['/api/cards'] = {
    get: {
      operationId: 'list_cards',
      summary: 'List all available HashDo cards',
      responses: {
        '200': {
          description: 'Array of available cards',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    tag: { type: 'string' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  for (const { card } of cards) {
    const operationId = card.name.replace(/-/g, '_');
    const { properties, required } = buildInputProperties(card.inputs);
    const tag = card.name.startsWith('do-')
      ? `#do/${card.name.slice(3)}`
      : `#${card.name}`;

    // POST /api/cards/{name} — execute card
    paths[`/api/cards/${card.name}`] = {
      post: {
        operationId,
        summary: `${tag}: ${card.description}`,
        requestBody: {
          required: required.length > 0,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties,
                ...(required.length > 0 ? { required } : {}),
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Card execution result with rendered image URL',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    card: { type: 'string' },
                    text: { type: 'string', description: 'Markdown-formatted card output' },
                    imageUrl: { type: 'string', format: 'uri', description: 'URL to rendered card image (PNG)' },
                  },
                },
              },
            },
          },
        },
      },
    };

    // GET /api/cards/{name}/image — render card as PNG
    const parameters = Object.entries(card.inputs).map(([name, def]) => ({
      name,
      in: 'query',
      required: def.required ?? false,
      schema: {
        ...inputTypeToJsonSchema(def.type),
        ...(def.enum ? { enum: [...def.enum] } : {}),
        ...(def.default !== undefined ? { default: def.default } : {}),
      },
      description: def.description,
    }));

    paths[`/api/cards/${card.name}/image`] = {
      get: {
        operationId: `${operationId}_image`,
        summary: `Render ${tag} card as PNG image`,
        parameters,
        responses: {
          '200': {
            description: 'Rendered card as PNG image',
            content: {
              'image/png': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'HashDo Cards API',
      version: '2.0.0',
      description:
        'Execute HashDo actionable cards. Each card fetches live data and returns a text summary plus a rendered image URL.',
    },
    servers: [{ url: baseUrl }],
    paths,
  };
}
