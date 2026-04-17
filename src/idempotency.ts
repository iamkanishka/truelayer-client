/**
 * Stable idempotency key manager.
 *
 * The same `operationId` always yields the same key until `release()` is called.
 * This ensures POST retries send an identical `Idempotency-Key` header,
 * preventing duplicate payments, payouts, or mandates.
 */
export class IdempotencyManager {
  private readonly keys = new Map<string, string>();

  keyFor(operationId: string): string {
    const existing = this.keys.get(operationId);
    if (existing !== undefined) return existing;
    const key = generateKey();
    this.keys.set(operationId, key);
    return key;
  }

  release(operationId: string): void {
    this.keys.delete(operationId);
  }

  static newKey(): string {
    return generateKey();
  }
}

function generateKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
