import { TruelayerError } from "../error.js";
import { jsonRequest } from "../http.js";
import { withRetry } from "../retry.js";
import { IdempotencyManager } from "../idempotency.js";
import { bearerHeaders } from "../auth/token.js";
import { PAYMENTS_SCOPES, type AuthClient } from "../auth/auth.js";
import type { Config } from "../config.js";
import type { Signer } from "../signing.js";

export type MandateStatus =
  | "authorization_required" | "authorizing" | "authorized"
  | "revoked" | "failed";

export interface CreateMandateRequest {
  mandate_type: string;
  currency: string;
  user: { name?: string; email?: string; phone?: string };
  constraints: Record<string, unknown>;
  provider_selection?: Record<string, unknown>;
  beneficiary?: Record<string, unknown>;
  metadata?: Record<string, string>;
}

export interface Mandate {
  id: string;
  mandate_type: string;
  status: MandateStatus;
  currency?: string;
  created_at?: string;
  authorized_at?: string;
  revoked_at?: string;
}

export class MandatesClient {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthClient,
    private readonly signer: Signer | null,
    private readonly idem: IdempotencyManager,
  ) {}

  async createMandate(params: CreateMandateRequest, operationId: string): Promise<Mandate> {
    if (!this.signer) throw TruelayerError.signingRequired();
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const path = "/v3/mandates";
    const idemKey = this.idem.keyFor(operationId);
    const headers: Record<string, string> = {
      ...bearerHeaders(token),
      "Idempotency-Key": idemKey,
      "Content-Type": "application/json",
    };
    const bodyStr = JSON.stringify(params);
    const sig = await this.signer.sign("POST", path, headers, bodyStr);
    return jsonRequest<Mandate>(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}${path}`,
      headers: { ...headers, "Tl-Signature": sig },
      body: params,
    }).then((r) => { this.idem.release(operationId); return r; });
  }

  async listMandates(cursor?: string): Promise<{ items?: Mandate[]; next?: string }> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return withRetry({ maxAttempts: this.config.maxRetries, baseDelayMs: this.config.baseRetryDelayMs, maxDelayMs: 10_000, multiplier: 2 }, () =>
      jsonRequest(this.config, {
        method: "GET",
        url: `${this.config.apiUrl}/v3/mandates${suffix}`,
        headers: bearerHeaders(token),
      }),
    );
  }

  async getMandate(mandateId: string): Promise<Mandate> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry({ maxAttempts: this.config.maxRetries, baseDelayMs: this.config.baseRetryDelayMs, maxDelayMs: 10_000, multiplier: 2 }, () =>
      jsonRequest<Mandate>(this.config, {
        method: "GET",
        url: `${this.config.apiUrl}/v3/mandates/${mandateId}`,
        headers: bearerHeaders(token),
      }),
    );
  }

  async startAuthorizationFlow(mandateId: string, params: unknown): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/mandates/${mandateId}/authorization-flow`,
      headers: bearerHeaders(token),
      body: params,
    });
  }

  async submitProviderSelection(mandateId: string, providerId: string): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/mandates/${mandateId}/authorization-flow/actions/provider-selection`,
      headers: bearerHeaders(token),
      body: { provider_id: providerId },
    });
  }

  async submitConsent(mandateId: string): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/mandates/${mandateId}/authorization-flow/actions/consent`,
      headers: bearerHeaders(token),
      body: { consent: true },
    });
  }

  async revokeMandate(mandateId: string): Promise<void> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    await jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/mandates/${mandateId}/revoke`,
      headers: bearerHeaders(token),
    });
  }

  async confirmFunds(mandateId: string, amountInMinor: number): Promise<{ confirmed: boolean }> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "GET",
      url: `${this.config.apiUrl}/v3/mandates/${mandateId}/funds?amount_in_minor=${amountInMinor}`,
      headers: bearerHeaders(token),
    });
  }

  async getConstraints(mandateId: string): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry({ maxAttempts: this.config.maxRetries, baseDelayMs: this.config.baseRetryDelayMs, maxDelayMs: 10_000, multiplier: 2 }, () =>
      jsonRequest(this.config, {
        method: "GET",
        url: `${this.config.apiUrl}/v3/mandates/${mandateId}/constraints`,
        headers: bearerHeaders(token),
      }),
    );
  }
}
