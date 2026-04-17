import { TruelayerError } from "./error.js";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly multiplier: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 10_000,
  multiplier: 2,
};

/**
 * Execute `fn` with exponential backoff and cryptographic jitter.
 *
 * Retries only when `TruelayerError.isRetryable` is true.
 * Uses `globalThis.crypto.getRandomValues` for timing-safe jitter.
 */
export async function withRetry<T>(policy: RetryPolicy, fn: () => Promise<T>): Promise<T> {
  let delay = policy.baseDelayMs;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= policy.maxAttempts) throw err;
      if (!(err instanceof TruelayerError) || !err.isRetryable) throw err;

      const jitter = cryptoJitter(delay);
      await sleep(jitter);
      delay = Math.min(delay * policy.multiplier, policy.maxDelayMs);
    }
  }

  // Unreachable — satisfies TypeScript exhaustiveness
  throw new TruelayerError({ type: "unknown", message: "Retry exhausted" });
}

/** Uniform random integer in [0, max) using crypto entropy. */
function cryptoJitter(maxMs: number): number {
  if (maxMs <= 0) return 0;
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! % maxMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
