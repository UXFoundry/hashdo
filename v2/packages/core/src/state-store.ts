import type { CardState, StateStore } from './types.js';

/**
 * In-memory state store. Good for development and testing.
 * Swap with Redis/Postgres/SQLite for production.
 */
export class MemoryStateStore implements StateStore {
  private data = new Map<string, CardState>();

  async get(cardKey: string): Promise<CardState | null> {
    return this.data.get(cardKey) ?? null;
  }

  async set(cardKey: string, state: CardState): Promise<void> {
    this.data.set(cardKey, state);
  }

  async delete(cardKey: string): Promise<void> {
    this.data.delete(cardKey);
  }
}
