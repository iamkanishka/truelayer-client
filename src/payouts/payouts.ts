import { TruelayerError } from "../error.js";
import { jsonRequest } from "../http.js";
import { withRetry } from "../retry.js";
import { IdempotencyManager } from "../idempotency.js";
import { bearerHeaders } from "../auth/token.js";
import { PAYMENTS_SCOPES, type AuthClient } from "../auth/auth.js";
import type { Config } from "../config.js";
import type { Signer } from "../signing.js";

export type PayoutStatus = "pending" | "authorized" | "executed" | "failed";

export interface CreatePayoutRequest {
  merchant_account_id: string;
  amount_in_minor: number;
  currency: string;
  beneficiary: Record<string, unknown>;
  metadata?: Record<string, string>;
}

export interface Payout {
  id: string;
  merchant_account_id: string;
  amount_in_minor: number;
  currency: string;
  status: PayoutStatus;
  created_at?: string;
  executed_at?: string;
}

export class PayoutsClient {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthClient,
    private readonly signer: Signer | null,
    private readonly idem: IdempotencyManager,
  ) {}

  async createPayout(params: CreatePayoutRequest, operationId: string): Promise<Payout> {
    if (!this.signer) throw TruelayerError.signingRequired();
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const path = "/v3/payouts";
    const idemKey = this.idem.keyFor(operationId);
    const headers: Record<string, string> = {
      ...bearerHeaders(token),
      "Idempotency-Key": idemKey,
      "Content-Type": "application/json",
    };
    const bodyStr = JSON.stringify(params);
    const sig = await this.signer.sign("POST", path, headers, bodyStr);

    return withRetry({ maxAttempts: this.config.maxRetries, baseDelayMs: this.config.baseRetryDelayMs, maxDelayMs: 10_000, multiplier: 2 }, () =>
      jsonRequest<Payout>(this.config, {
        method: "POST",
        url: `${this.config.apiUrl}${path}`,
        headers: { ...headers, "Tl-Signature": sig },
        body: params,
      }),
    ).then((r) => { this.idem.release(operationId); return r; });
  }

  async getPayout(payoutId: string): Promise<Payout> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry({ maxAttempts: this.config.maxRetries, baseDelayMs: this.config.baseRetryDelayMs, maxDelayMs: 10_000, multiplier: 2 }, () =>
      jsonRequest<Payout>(this.config, {
        method: "GET",
        url: `${this.config.apiUrl}/v3/payouts/${payoutId}`,
        headers: bearerHeaders(token),
      }),
    );
  }
}
