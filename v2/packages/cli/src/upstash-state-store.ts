import { Redis } from '@upstash/redis';
import type { CardState, StateStore } from '@hashdo/core';

export interface UpstashStateStoreOptions {
  url: string;
  token: string;
  /** TTL in seconds for state entries. Default: 2_592_000 (30 days). */
  ttlSeconds?: number;
}

/**
 * Persistent state store backed by Upstash Redis (REST API).
 * Works in stateless/serverless contexts — no persistent TCP connections.
 */
export class UpstashStateStore implements StateStore {
  private redis: Redis;
  private ttlSeconds: number;

  constructor(options: UpstashStateStoreOptions) {
    this.redis = new Redis({ url: options.url, token: options.token });
    this.ttlSeconds = options.ttlSeconds ?? 2_592_000; // 30 days
  }

  async get(cardKey: string): Promise<CardState | null> {
    const data = await this.redis.get<CardState>(cardKey);
    return data ?? null;
  }

  async set(cardKey: string, state: CardState): Promise<void> {
    await this.redis.set(cardKey, state, { ex: this.ttlSeconds });
  }

  async delete(cardKey: string): Promise<void> {
    await this.redis.del(cardKey);
  }
}
