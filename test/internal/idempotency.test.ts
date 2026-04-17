import { describe, it, expect } from "vitest";
import { IdempotencyManager } from "../../src/idempotency.js";

describe("IdempotencyManager", () => {
  it("returns same key for same operationId", () => {
    const mgr = new IdempotencyManager();
    const k1 = mgr.keyFor("order-001");
    const k2 = mgr.keyFor("order-001");
    expect(k1).toBe(k2);
  });

  it("returns different keys for different IDs", () => {
    const mgr = new IdempotencyManager();
    expect(mgr.keyFor("a")).not.toBe(mgr.keyFor("b"));
  });

  it("generates fresh key after release", () => {
    const mgr = new IdempotencyManager();
    const k1 = mgr.keyFor("op");
    mgr.release("op");
    const k2 = mgr.keyFor("op");
    expect(k1).not.toBe(k2);
  });

  it("newKey() generates unique UUIDs", () => {
    const keys = Array.from({ length: 100 }, () => IdempotencyManager.newKey());
    expect(new Set(keys).size).toBe(100);
  });

  it("newKey() has UUID v4 format", () => {
    const key = IdempotencyManager.newKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
