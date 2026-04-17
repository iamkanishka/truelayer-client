import { TruelayerError } from "../error.js";
import { jsonRequest } from "../http.js";
import { withRetry } from "../retry.js";
import { type AuthClient } from "../auth/auth.js";
import type { Config } from "../config.js";

export interface Account {
  account_id: string;
  display_name?: string;
  currency: string;
  account_type?: string;
  provider?: { display_name?: string; logo_uri?: string };
  account_number?: { sort_code?: string; number?: string; iban?: string };
}

export interface Balance {
  currency: string;
  available: number;
  current: number;
  overdraft?: number;
  update_timestamp?: string;
}

export interface Transaction {
  transaction_id: string;
  normalised_provider_transaction_id?: string;
  amount: number;
  currency: string;
  timestamp?: string;
  description?: string;
  transaction_type?: string;
  transaction_category?: string;
  merchant_name?: string;
  running_balance?: { currency: string; amount: number };
}

export interface Card {
  account_id: string;
  card_network?: string;
  card_type?: string;
  currency?: string;
  display_name?: string;
}

export interface CardBalance {
  currency: string;
  available?: number;
  current?: number;
  credit_limit?: number;
}

export interface StandingOrder {
  standing_order_id?: string;
  frequency?: string;
  status?: string;
  next_payment_date?: string;
  next_payment_amount?: number;
  currency?: string;
  payee_name?: string;
}

export interface DirectDebit {
  direct_debit_id?: string;
  name?: string;
  status?: string;
  previous_payment_timestamp?: string;
  previous_payment_amount?: number;
  currency?: string;
}

export interface GetTransactionsOptions {
  from?: Date | string;
  to?: Date | string;
}

type DataApiResponse<T> = { results?: T[]; status?: string };

export class DataClient {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthClient,
    ) {}

  async getConnectionMeta(): Promise<Record<string, unknown>> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<Record<string, unknown>>>(
      token.accessToken, "/data/v1/me"
    );
    const results = resp.results ?? [];
    if (!results[0]) throw new TruelayerError({ type: "not_found", status: 404, message: "connection meta not found" });
    return results[0];
  }

  async getUserInfo(): Promise<Record<string, unknown>> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<Record<string, unknown>>>(
      token.accessToken, "/data/v1/info"
    );
    const results = resp.results ?? [];
    if (!results[0]) throw new TruelayerError({ type: "not_found", status: 404, message: "user info not found" });
    return results[0];
  }

  async listAccounts(): Promise<Account[]> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<Account>>(token.accessToken, "/data/v1/accounts");
    return resp.results ?? [];
  }

  async getAccount(accountId: string): Promise<Account> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<Account>>(token.accessToken, `/data/v1/accounts/${accountId}`);
    const results = resp.results ?? [];
    if (!results[0]) throw new TruelayerError({ type: "not_found", status: 404, message: "account not found" });
    return results[0];
  }

  async getAccountBalance(accountId: string): Promise<Balance> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<Balance>>(token.accessToken, `/data/v1/accounts/${accountId}/balance`);
    const results = resp.results ?? [];
    if (!results[0]) throw new TruelayerError({ type: "not_found", status: 404, message: "balance not found" });
    return results[0];
  }

  async getTransactions(accountId: string, opts: GetTransactionsOptions = {}): Promise<Transaction[]> {
    const token = await this.auth.validToken("data");
    const qs = buildDateQs(opts);
    const resp = await this.get<DataApiResponse<Transaction>>(
      token.accessToken, `/data/v1/accounts/${accountId}/transactions${qs}`
    );
    return resp.results ?? [];
  }

  async getPendingTransactions(accountId: string, opts: GetTransactionsOptions = {}): Promise<Transaction[]> {
    const token = await this.auth.validToken("data");
    const qs = buildDateQs(opts);
    const resp = await this.get<DataApiResponse<Transaction>>(
      token.accessToken, `/data/v1/accounts/${accountId}/transactions/pending${qs}`
    );
    return resp.results ?? [];
  }

  /**
   * Returns an async generator that yields transactions lazily.
   * Compatible with `for await...of` loops.
   *
   * @example
   * ```ts
   * for await (const txn of client.data.transactionStream(accountId)) {
   *   console.log(txn.amount);
   * }
   * ```
   */
  async *transactionStream(
    accountId: string,
    opts: GetTransactionsOptions = {},
  ): AsyncGenerator<Transaction> {
    const txns = await this.getTransactions(accountId, opts);
    for (const txn of txns) {
      yield txn;
    }
  }

  async getStandingOrders(accountId: string): Promise<StandingOrder[]> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<StandingOrder>>(
      token.accessToken, `/data/v1/accounts/${accountId}/standing_orders`
    );
    return resp.results ?? [];
  }

  async getDirectDebits(accountId: string): Promise<DirectDebit[]> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<DirectDebit>>(
      token.accessToken, `/data/v1/accounts/${accountId}/direct_debits`
    );
    return resp.results ?? [];
  }

  async listCards(): Promise<Card[]> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<Card>>(token.accessToken, "/data/v1/cards");
    return resp.results ?? [];
  }

  async getCard(accountId: string): Promise<Card> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<Card>>(token.accessToken, `/data/v1/cards/${accountId}`);
    const results = resp.results ?? [];
    if (!results[0]) throw new TruelayerError({ type: "not_found", status: 404, message: "card not found" });
    return results[0];
  }

  async getCardBalance(accountId: string): Promise<CardBalance> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<CardBalance>>(
      token.accessToken, `/data/v1/cards/${accountId}/balance`
    );
    const results = resp.results ?? [];
    if (!results[0]) throw new TruelayerError({ type: "not_found", status: 404, message: "card balance not found" });
    return results[0];
  }

  async getCardTransactions(accountId: string, opts: GetTransactionsOptions = {}): Promise<Transaction[]> {
    const token = await this.auth.validToken("data");
    const qs = buildDateQs(opts);
    const resp = await this.get<DataApiResponse<Transaction>>(
      token.accessToken, `/data/v1/cards/${accountId}/transactions${qs}`
    );
    return resp.results ?? [];
  }

  async listProviders(): Promise<unknown[]> {
    const token = await this.auth.validToken("data");
    const resp = await this.get<DataApiResponse<unknown>>(token.accessToken, "/data/v1/providers");
    return resp.results ?? [];
  }

  private get<T>(accessToken: string, path: string): Promise<T> {
    return withRetry({ maxAttempts: this.config.maxRetries, baseDelayMs: this.config.baseRetryDelayMs, maxDelayMs: 10_000, multiplier: 2 }, () =>
      jsonRequest<T>(this.config, {
        method: "GET",
        url: `${this.config.apiUrl}${path}`,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
  }
}

function buildDateQs(opts: GetTransactionsOptions): string {
  const qs = new URLSearchParams();
  if (opts.from) qs.set("from", opts.from instanceof Date ? opts.from.toISOString() : opts.from);
  if (opts.to) qs.set("to", opts.to instanceof Date ? opts.to.toISOString() : opts.to);
  return qs.toString() ? `?${qs.toString()}` : "";
}
