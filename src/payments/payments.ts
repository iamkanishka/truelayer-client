import { TruelayerError } from "../error.js";
import { jsonRequest } from "../http.js";
import { withRetry } from "../retry.js";
import { IdempotencyManager } from "../idempotency.js";
import { bearerHeaders } from "../auth/token.js";
import { PAYMENTS_SCOPES, type AuthClient } from "../auth/auth.js";
import type { Config } from "../config.js";
import type { Signer } from "../signing.js";
import type {
  CreatePaymentLinkRequest,
  CreatePaymentRequest,
  CreateRefundRequest,
  Payment,
  PaymentLink,
  Provider,
  Refund,
} from "./types.js";

const TERMINAL_STATUSES = new Set(["executed", "settled", "failed", "cancelled"]);

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export class PaymentsClient {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthClient,
    private readonly signer: Signer | null,
    private readonly idem: IdempotencyManager,
  ) {}

  // ── Payments ────────────────────────────────────────────────────────────────

  async createPayment(params: CreatePaymentRequest, operationId: string): Promise<Payment> {
    this.requireSigner();
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const path = "/v3/payments";
    const idemKey = this.idem.keyFor(operationId);
    const headers = this.buildHeaders(token.accessToken, idemKey);
    const bodyStr = JSON.stringify(params);
    const sig = await this.signer!.sign("POST", path, headers, bodyStr);
    const signedHeaders = { ...headers, "Tl-Signature": sig };

    return await withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<Payment>(this.config, {
          method: "POST",
          url: `${this.config.apiUrl}${path}`,
          headers: signedHeaders,
          body: params,
        }),
    ).then((r) => {
      this.idem.release(operationId);
      return r;
    });
  }

  async getPayment(paymentId: string): Promise<Payment> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<Payment>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/payments/${paymentId}`,
          headers: bearerHeaders(token),
        }),
    );
  }

  async cancelPayment(paymentId: string, operationId?: string): Promise<unknown> {
    this.requireSigner();
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const path = `/v3/payments/${paymentId}/cancel`;
    const idemKey = this.idem.keyFor(operationId ?? `cancel-${paymentId}`);
    const headers = this.buildHeaders(token.accessToken, idemKey);
    const sig = await this.signer!.sign("POST", path, headers, "");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}${path}`,
      headers: { ...headers, "Tl-Signature": sig },
    });
  }

  // ── Authorization flow ──────────────────────────────────────────────────────

  async startAuthorizationFlow(paymentId: string, params: unknown): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/payments/${paymentId}/authorization-flow`,
      headers: bearerHeaders(token),
      body: params,
    });
  }

  async submitProviderSelection(paymentId: string, providerId: string): Promise<unknown> {
    return this.postFlowAction(paymentId, "provider-selection", {
      provider_id: providerId,
    });
  }

  async submitSchemeSelection(paymentId: string, schemeId: string): Promise<unknown> {
    return this.postFlowAction(paymentId, "scheme-selection", {
      scheme_id: schemeId,
    });
  }

  async submitForm(paymentId: string, inputs: Record<string, unknown>): Promise<unknown> {
    return this.postFlowAction(paymentId, "form", { inputs });
  }

  async submitConsent(paymentId: string): Promise<unknown> {
    return this.postFlowAction(paymentId, "consent", { consent: true });
  }

  async submitReturnParameters(params: unknown): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/payments-providers/return`,
      headers: bearerHeaders(token),
      body: params,
    });
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  async createRefund(
    paymentId: string,
    params: CreateRefundRequest,
    operationId: string,
  ): Promise<Refund> {
    this.requireSigner();
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const path = `/v3/payments/${paymentId}/refunds`;
    const idemKey = this.idem.keyFor(operationId);
    const headers = this.buildHeaders(token.accessToken, idemKey);
    const bodyStr = JSON.stringify(params);
    const sig = await this.signer!.sign("POST", path, headers, bodyStr);

    return jsonRequest<Refund>(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}${path}`,
      headers: { ...headers, "Tl-Signature": sig },
      body: params,
    }).then((r) => {
      this.idem.release(operationId);
      return r;
    });
  }

  async getRefund(paymentId: string, refundId: string): Promise<Refund> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<Refund>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/payments/${paymentId}/refunds/${refundId}`,
          headers: bearerHeaders(token),
        }),
    );
  }

  async listRefunds(paymentId: string): Promise<Refund[]> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const resp = await withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<{ items?: Refund[] }>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/payments/${paymentId}/refunds`,
          headers: bearerHeaders(token),
        }),
    );
    return resp.items ?? [];
  }

  // ── Payment links ───────────────────────────────────────────────────────────

  async createPaymentLink(
    params: CreatePaymentLinkRequest,
    operationId: string,
  ): Promise<PaymentLink> {
    this.requireSigner();
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const path = "/v3/payment-links";
    const idemKey = this.idem.keyFor(operationId);
    const headers = this.buildHeaders(token.accessToken, idemKey);
    const bodyStr = JSON.stringify(params);
    const sig = await this.signer!.sign("POST", path, headers, bodyStr);

    return jsonRequest<PaymentLink>(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}${path}`,
      headers: { ...headers, "Tl-Signature": sig },
      body: params,
    }).then((r) => {
      this.idem.release(operationId);
      return r;
    });
  }

  async getPaymentLink(linkId: string): Promise<PaymentLink> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<PaymentLink>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/payment-links/${linkId}`,
          headers: bearerHeaders(token),
        }),
    );
  }

  // ── Providers ───────────────────────────────────────────────────────────────

  async searchProviders(params?: unknown): Promise<{ providers?: Provider[] }> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/payments-providers/search`,
      headers: bearerHeaders(token),
      body: params ?? {},
    });
  }

  async getProvider(providerId: string): Promise<Provider> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<Provider>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/payments-providers/${providerId}`,
          headers: bearerHeaders(token),
        }),
    );
  }

  // ── Polling ─────────────────────────────────────────────────────────────────

  async waitForFinalStatus(paymentId: string, opts: WaitOptions = {}): Promise<Payment> {
    const timeoutMs = opts.timeoutMs ?? 60_000;
    const intervalMs = opts.intervalMs ?? 2_000;
    const deadline = Date.now() + timeoutMs;

    // eslint-disable-next-line no-constant-condition -- poll loop; exits via return or throw
    while (true) {
      const payment = await this.getPayment(paymentId);
      if (TERMINAL_STATUSES.has(payment.status)) return payment;

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new TruelayerError({
          type: "timeout",
          message: `Timeout waiting for payment ${paymentId}; last status: ${payment.status}`,
        });
      }
      await sleep(Math.min(intervalMs, remaining));
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async postFlowAction(paymentId: string, action: string, body: unknown): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/payments/${paymentId}/authorization-flow/actions/${action}`,
      headers: bearerHeaders(token),
      body,
    });
  }

  private requireSigner(): void {
    if (!this.signer) throw TruelayerError.signingRequired();
  }

  private buildHeaders(accessToken: string, idemKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      "Idempotency-Key": idemKey,
      "Content-Type": "application/json",
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
