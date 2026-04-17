import { describe, it, expect, vi } from "vitest";
import { WebhooksClient, WebhookEvents, type WebhookEvent } from "../../src/webhooks/webhooks.js";
import { buildConfig } from "../../src/config.js";

const SECRET = "test-hmac-secret-key";

function makeClient(overrides: Record<string, unknown> = {}) {
  const cfg = buildConfig({
    clientId: "id",
    clientSecret: "s",
    webhookSigningSecret: SECRET,
    webhookReplayToleranceSec: 300,
    ...overrides,
  });
  return new WebhooksClient(cfg);
}

function freshTimestamp(): string {
  return new Date().toISOString();
}

function makeBody(eventType: string, payload: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event_id: `evt-${Math.random().toString(36).slice(2)}`,
    event_type: eventType,
    event_version: 1,
    timestamp: freshTimestamp(),
    payload,
  });
}

async function signBody(body: string, timestamp: string, secret: string): Promise<string> {
  const payload = `${timestamp}.${body}`;
  const key = await globalThis.crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("WebhookEvents constants", () => {
  it("all values are unique strings", () => {
    const values = Object.values(WebhookEvents);
    expect(new Set(values).size).toBe(values.length);
    values.forEach((v) => expect(typeof v).toBe("string"));
  });
});

describe("WebhooksClient signature verification", () => {
  it("accepts a valid HMAC signature", async () => {
    const client = makeClient();
    const ts = freshTimestamp();
    const body = makeBody(WebhookEvents.PAYMENT_EXECUTED, { payment_id: "pay_001" });
    const sig = await signBody(body, ts, SECRET);
    await expect(client.process(body, sig, ts)).resolves.toBeUndefined();
  });

  it("rejects an invalid signature", async () => {
    const client = makeClient();
    const body = makeBody(WebhookEvents.PAYMENT_EXECUTED);
    await expect(client.process(body, "deadbeef00000000", freshTimestamp())).rejects.toMatchObject({
      type: "signature_invalid",
    });
  });

  it("rejects a null signature when secret configured", async () => {
    const client = makeClient();
    const body = makeBody(WebhookEvents.PAYMENT_EXECUTED);
    await expect(client.process(body, null, freshTimestamp())).rejects.toMatchObject({
      type: "signature_invalid",
    });
  });

  it("rejects a tampered body", async () => {
    const client = makeClient();
    const ts = freshTimestamp();
    const original = makeBody(WebhookEvents.PAYMENT_EXECUTED, { payment_id: "pay_001" });
    const sig = await signBody(original, ts, SECRET);
    const tampered = makeBody(WebhookEvents.PAYMENT_EXECUTED, { payment_id: "pay_EVIL" });
    await expect(client.process(tampered, sig, ts)).rejects.toMatchObject({ type: "signature_invalid" });
  });

  it("skips verification when no secret configured", async () => {
    const cfg = buildConfig({ clientId: "id", clientSecret: "s" });
    const client = new WebhooksClient(cfg);
    const body = makeBody(WebhookEvents.PAYMENT_EXECUTED);
    await expect(client.process(body, null, null)).resolves.toBeUndefined();
  });
});

describe("WebhooksClient replay protection", () => {
  it("accepts events within tolerance window", async () => {
    const client = makeClient();
    const ts = new Date(Date.now() - 60_000).toISOString();
    const body = makeBody(WebhookEvents.PAYMENT_EXECUTED);
    const sig = await signBody(body, ts, SECRET);
    await expect(client.process(body, sig, ts)).resolves.toBeUndefined();
  });

  it("rejects events older than tolerance", async () => {
    const client = makeClient();
    const ts = new Date(Date.now() - 600_000).toISOString();
    const body = makeBody(WebhookEvents.PAYMENT_EXECUTED);
    const sig = await signBody(body, ts, SECRET);
    await expect(client.process(body, sig, ts)).rejects.toMatchObject({ type: "replay_attack" });
  });
});

describe("WebhooksClient dispatch", () => {
  it("dispatches event to registered handler", async () => {
    const client = makeClient();
    const received: WebhookEvent[] = [];
    client.on(WebhookEvents.PAYMENT_EXECUTED, (event) => { received.push(event); });

    const ts = freshTimestamp();
    const body = makeBody(WebhookEvents.PAYMENT_EXECUTED, { payment_id: "pay_abc" });
    const sig = await signBody(body, ts, SECRET);
    await client.process(body, sig, ts);

    expect(received).toHaveLength(1);
    expect(received[0]!.event_type).toBe("payment_executed");
  });

  it("calls all handlers for same event type in order", async () => {
    const client = makeClient();
    const order: number[] = [];
    client.on(WebhookEvents.PAYMENT_SETTLED, () => { order.push(1); });
    client.on(WebhookEvents.PAYMENT_SETTLED, () => { order.push(2); });
    client.on(WebhookEvents.PAYMENT_SETTLED, () => { order.push(3); });

    const ts = freshTimestamp();
    const body = makeBody(WebhookEvents.PAYMENT_SETTLED);
    const sig = await signBody(body, ts, SECRET);
    await client.process(body, sig, ts);
    expect(order).toEqual([1, 2, 3]);
  });

  it("calls fallback for unregistered event type", async () => {
    const client = makeClient();
    const seen: string[] = [];
    client.onFallback((e) => { seen.push(e.event_type); });

    const ts = freshTimestamp();
    const body = makeBody("brand_new_event_2099");
    const sig = await signBody(body, ts, SECRET);
    await client.process(body, sig, ts);
    expect(seen).toContain("brand_new_event_2099");
  });

  it("returns without error when no handler and no fallback", async () => {
    const client = makeClient();
    const ts = freshTimestamp();
    const body = makeBody("unhandled_event");
    const sig = await signBody(body, ts, SECRET);
    await expect(client.process(body, sig, ts)).resolves.toBeUndefined();
  });

  it("propagates handler error and stops dispatch", async () => {
    const client = makeClient();
    const secondCalled = vi.fn();
    client.on(WebhookEvents.PAYMENT_FAILED, async () => { throw new Error("handler-error"); });
    client.on(WebhookEvents.PAYMENT_FAILED, secondCalled);

    const ts = freshTimestamp();
    const body = makeBody(WebhookEvents.PAYMENT_FAILED, { payment_id: "pay_err" });
    const sig = await signBody(body, ts, SECRET);
    await expect(client.process(body, sig, ts)).rejects.toThrow("handler-error");
    expect(secondCalled).not.toHaveBeenCalled();
  });

  it("supports method chaining on on()", () => {
    const client = makeClient();
    const result = client.on(WebhookEvents.PAYOUT_EXECUTED, () => {});
    expect(result).toBe(client);
  });

  it("accepts Buffer body", async () => {
    const client = makeClient();
    const ts = freshTimestamp();
    const bodyStr = makeBody(WebhookEvents.PAYMENT_EXECUTED);
    const bodyBuf = Buffer.from(bodyStr, "utf-8");
    const sig = await signBody(bodyStr, ts, SECRET);
    await expect(client.process(bodyBuf, sig, ts)).resolves.toBeUndefined();
  });
});
