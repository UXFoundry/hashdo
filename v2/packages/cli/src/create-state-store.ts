import { MemoryStateStore, type StateStore } from '@hashdo/core';
import { UpstashStateStore } from './upstash-state-store.js';

/**
 * Create the appropriate StateStore based on environment variables.
 * Falls back to MemoryStateStore when Upstash credentials aren't configured.
 */
export function createStateStore(): StateStore {
  const url = process.env['UPSTASH_REDIS_REST_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'];

  if (url && token) {
    const ttlSeconds = process.env['HASHDO_STATE_TTL_SECONDS']
      ? parseInt(process.env['HASHDO_STATE_TTL_SECONDS'], 10)
      : undefined;

    console.error('[hashdo] Using Upstash Redis for state persistence');
    return new UpstashStateStore({ url, token, ttlSeconds });
  }

  console.error(
    '[hashdo] No UPSTASH_REDIS_REST_URL configured — using in-memory state (state will not persist across requests)'
  );
  return new MemoryStateStore();
}
