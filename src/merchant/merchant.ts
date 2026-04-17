import { jsonRequest } from "../http.js";
import { withRetry } from "../retry.js";
import { PAYMENTS_SCOPES, type AuthClient } from "../auth/auth.js";
import type { Config } from "../config.js";
import { bearerHeaders } from "../auth/token.js";

export interface MerchantAccount {
  id: string;
  currency: string;
  account_holder_name: string;
  available_balance_in_minor: number;
  current_balance_in_minor: number;
  account_identifiers?: unknown[];
}

export interface MerchantTransaction {
  id: string;
  amount_in_minor: number;
  currency: string;
  type: string;
  created_at?: string;
}

export interface SweepingConfig {
  max_amount_in_minor: number;
  currency: string;
  frequency: string;
}

export interface GetTransactionsOptions {
  from?: string;
  to?: string;
  type?: string;
  cursor?: string;
}

export class MerchantClient {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthClient,
  ) {}

  async listAccounts(): Promise<MerchantAccount[]> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const resp = await withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<{ items?: MerchantAccount[] }>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/merchant-accounts`,
          headers: bearerHeaders(token),
        }),
    );
    return resp.items ?? [];
  }

  async getAccount(accountId: string): Promise<MerchantAccount> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<MerchantAccount>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/merchant-accounts/${accountId}`,
          headers: bearerHeaders(token),
        }),
    );
  }

  async getTransactions(
    accountId: string,
    opts: GetTransactionsOptions = {},
  ): Promise<{ items?: MerchantTransaction[]; next?: string }> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const qs = new URLSearchParams();
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    if (opts.type) qs.set("type", opts.type);
    if (opts.cursor) qs.set("cursor", opts.cursor);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/merchant-accounts/${accountId}/transactions${suffix}`,
          headers: bearerHeaders(token),
        }),
    );
  }

  async setupSweeping(accountId: string, params: SweepingConfig): Promise<SweepingConfig> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest<SweepingConfig>(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/v3/merchant-accounts/${accountId}/sweeping`,
      headers: bearerHeaders(token),
      body: params,
    });
  }

  async disableSweeping(accountId: string): Promise<void> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    await jsonRequest(this.config, {
      method: "DELETE",
      url: `${this.config.apiUrl}/v3/merchant-accounts/${accountId}/sweeping`,
      headers: bearerHeaders(token),
    });
  }

  async getSweeping(accountId: string): Promise<SweepingConfig> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<SweepingConfig>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/merchant-accounts/${accountId}/sweeping`,
          headers: bearerHeaders(token),
        }),
    );
  }

  async getPaymentSources(accountId: string): Promise<unknown[]> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    const resp = await withRetry(
      {
        maxAttempts: this.config.maxRetries,
        baseDelayMs: this.config.baseRetryDelayMs,
        maxDelayMs: 10_000,
        multiplier: 2,
      },
      () =>
        jsonRequest<{ items?: unknown[] }>(this.config, {
          method: "GET",
          url: `${this.config.apiUrl}/v3/merchant-accounts/${accountId}/payment-sources`,
          headers: bearerHeaders(token),
        }),
    );
    return resp.items ?? [];
  }
}
