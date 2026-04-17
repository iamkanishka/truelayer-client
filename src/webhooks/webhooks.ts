import { TruelayerError } from "../error.js";
import type { Config } from "../config.js";

// ── Event type constants ──────────────────────────────────────────────────────

export const WebhookEvents = {
  PAYMENT_AUTHORIZED: "payment_authorized",
  PAYMENT_EXECUTED: "payment_executed",
  PAYMENT_SETTLED: "payment_settled",
  PAYMENT_FAILED: "payment_failed",
  REFUND_EXECUTED: "refund_executed",
  REFUND_FAILED: "refund_failed",
  PAYOUT_EXECUTED: "payout_executed",
  PAYOUT_FAILED: "payout_failed",
  MANDATE_AUTHORIZED: "mandate_authorized",
  MANDATE_REVOKED: "mandate_revoked",
  MANDATE_FAILED: "mandate_failed",
  MERCHANT_ACCOUNT_PAYMENT_SETTLED: "merchant_account_payment_settled",
  MERCHANT_ACCOUNT_PAYMENT_FAILED: "merchant_account_payment_failed",
  VRP_PAYMENT_EXECUTED: "vrp_payment_executed",
  VRP_PAYMENT_FAILED: "vrp_payment_failed",
  PAYMENT_LINK_PAYMENT_EXECUTED: "payment_link_payment_executed",
  ACCOUNT_HOLDER_VERIFICATION_COMPLETED: "account_holder_verification_completed",
  ACCOUNT_HOLDER_VERIFICATION_FAILED: "account_holder_verification_failed",
  IDENTITY_AUTHORIZATION_EXPIRED: "identity_authorization_expired",
} as const;

export type WebhookEventType = (typeof WebhookEvents)[keyof typeof WebhookEvents];

export interface WebhookEvent {
  event_id: string;
  event_type: string;
  event_version: number;
  timestamp: string;
  payload: Record<string, unknown>;
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void> | void;
export type FallbackHandler = (event: WebhookEvent) => Promise<void> | void;

/**
 * TrueLayer webhook processor.
 *
 * Handles HMAC-SHA256 signature verification, replay-attack protection,
 * and typed handler dispatch.
 *
 * ## Security model
 *
 * 1. **HMAC-SHA256 verification** — constant-time comparison via SubtleCrypto
 * 2. **Replay protection** — events older than `webhookReplayToleranceSec` are rejected
 * 3. **Typed dispatch** — handlers registered per event type via `on()`
 */
export class WebhooksClient {
  private readonly handlers = new Map<string, WebhookHandler[]>();
  private fallback?: FallbackHandler;

  constructor(private readonly config: Config) {}

  /**
   * Register a handler for a specific event type.
   * Multiple handlers per event type are supported; all are called in order.
   *
   * @example
   * ```ts
   * client.webhooks.on(WebhookEvents.PAYMENT_EXECUTED, async (event) => {
   *   const { payment_id } = event.payload;
   *   await markPaymentComplete(payment_id as string);
   * });
   * ```
   */
  on(eventType: string, handler: WebhookHandler): this {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, handler]);
    return this;
  }

  /**
   * Register a fallback handler for unregistered event types.
   */
  onFallback(handler: FallbackHandler): this {
    this.fallback = handler;
    return this;
  }

  /**
   * Verify and dispatch a raw webhook payload.
   *
   * @param body       Raw request body string (must not be pre-parsed)
   * @param signature  Value of the `Tl-Signature` request header
   * @param timestamp  Value of the `Tl-Timestamp` request header (ISO 8601)
   *
   * @throws `TruelayerError` with `type: "signature_invalid"` on bad signature
   * @throws `TruelayerError` with `type: "replay_attack"` for stale events
   */
  async process(body: string, signature: string | null, timestamp: string | null): Promise<void> {
    await this.verifySignature(body, signature, timestamp);
    this.checkReplay(timestamp);

    let event: WebhookEvent;
    try {
      event = JSON.parse(body) as WebhookEvent;
    } catch {
      throw new TruelayerError({
        type: "decode_error",
        message: "Failed to parse webhook body as JSON",
      });
    }

    await this.dispatch(event);
  }

  // ── Signature verification ──────────────────────────────────────────────────

  private async verifySignature(
    body: string,
    signature: string | null,
    timestamp: string | null,
  ): Promise<void> {
    if (!this.config.webhookSigningSecret) return; // no secret — skip

    if (!signature) {
      throw new TruelayerError({
        type: "signature_invalid",
        message: "Missing Tl-Signature header",
      });
    }

    const ts = timestamp ?? "";
    const payload = `${ts}.${body}`;
    const encoder = new TextEncoder();
    const secretKey = await globalThis.crypto.subtle.importKey(
      "raw",
      encoder.encode(this.config.webhookSigningSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const expectedBuffer = await globalThis.crypto.subtle.sign(
      "HMAC",
      secretKey,
      encoder.encode(payload),
    );
    const expected = bufToHex(expectedBuffer);

    // Constant-time comparison via HMAC of both values
    if (!constantTimeEqual(expected, signature.toLowerCase())) {
      throw new TruelayerError({
        type: "signature_invalid",
        message: "Webhook signature verification failed",
      });
    }
  }

  // ── Replay protection ───────────────────────────────────────────────────────

  private checkReplay(timestamp: string | null): void {
    if (!timestamp) return;
    const eventTime = new Date(timestamp).getTime();
    if (isNaN(eventTime)) return;
    const ageSec = Math.abs(Date.now() - eventTime) / 1000;
    if (ageSec > this.config.webhookReplayToleranceSec) {
      throw new TruelayerError({
        type: "replay_attack",
        message: `Webhook event is ${Math.round(ageSec)}s old (tolerance: ${this.config.webhookReplayToleranceSec}s)`,
      });
    }
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────

  private async dispatch(event: WebhookEvent): Promise<void> {
    const handlers = this.handlers.get(event.event_type);

    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        await handler(event);
      }
      return;
    }

    if (this.fallback) {
      await this.fallback(event);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
