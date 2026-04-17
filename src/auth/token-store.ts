import type { Token, TokenType } from "./token.js";

/**
 * Interface for pluggable OAuth2 token storage backends.
 *
 * The default `MemoryTokenStore` is suitable for single-process deployments.
 * For distributed systems, implement this interface with a Redis or DynamoDB backend:
 *
 * @example
 * class RedisTokenStore implements TokenStore {
 *   async get(storeId, type) {
 *     const raw = await redis.get(`truelayer:${storeId}:${type}`);
 *     return raw ? JSON.parse(raw) : null;
 *   }
 *   async put(storeId, type, token) {
 *     const ttl = Math.max(Math.floor((token.expiresAt.getTime() - Date.now()) / 1000), 1);
 *     await redis.setEx(`truelayer:${storeId}:${type}`, ttl, JSON.stringify(token));
 *   }
 *   async delete(storeId, type) {
 *     await redis.del(`truelayer:${storeId}:${type}`);
 *   }
 * }
 */
export interface TokenStore {
  get(storeId: string, tokenType: TokenType): Promise<Token | null>;
  put(storeId: string, tokenType: TokenType, token: Token): Promise<void>;
  delete(storeId: string, tokenType: TokenType): Promise<void>;
}

/** Default in-memory token store. Not suitable for distributed deployments. */
export class MemoryTokenStore implements TokenStore {
  private readonly store = new Map<string, Token>();

  // eslint-disable-next-line @typescript-eslint/require-await -- synchronous Map, returns Promise to satisfy interface
  async get(storeId: string, tokenType: TokenType): Promise<Token | null> {
    return this.store.get(`${storeId}:${tokenType}`) ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- synchronous Map, returns Promise to satisfy interface
  async put(storeId: string, tokenType: TokenType, token: Token): Promise<void> {
    this.store.set(`${storeId}:${tokenType}`, token);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- synchronous Map, returns Promise to satisfy interface
  async delete(storeId: string, tokenType: TokenType): Promise<void> {
    this.store.delete(`${storeId}:${tokenType}`);
  }
}
