// @hashdo/mcp-adapter — Expose HashDo cards as MCP tools

export { createMcpCardServer, serveMcp, handleMcpRequest } from './server.js';
export { inputSchemaToZodShape } from './schema.js';
export type { McpCardServerOptions } from './server.js';
