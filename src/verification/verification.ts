import { TruelayerError } from "../error.js";
import { jsonRequest } from "../http.js";
import { withRetry } from "../retry.js";
import { DATA_SCOPES, type AuthClient } from "../auth/auth.js";
import type { Config } from "../config.js";
import { bearerHeaders } from "../auth/token.js";

export type VerificationResult = "match" | "no_match" | "partial_match";
export type AHVStatus = "pending" | "verified" | "failed";

export interface VerifyNameRequest {
  account_holder_name: string;
  account_identifier: Record<string, string>;
}

export interface VerifyNameResponse {
  result: VerificationResult;
  reason_codes?: string[];
}

export interface AHVResource {
  id: string;
  status: AHVStatus;
  match_score?: number;
  created_at?: string;
}

export class VerificationClient {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthClient,
    ) {}

  async verifyAccountHolderName(params: VerifyNameRequest): Promise<VerifyNameResponse> {
    if (!params.account_holder_name) {
      throw TruelayerError.validation("account_holder_name is required");
    }
    const token = await this.auth.clientCredentials(DATA_SCOPES, "data");
    return jsonRequest<VerifyNameResponse>(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/verification/account-holder-name`,
      headers: bearerHeaders(token),
      body: params,
    });
  }

  async createAccountHolderVerification(params: unknown): Promise<AHVResource> {
    const token = await this.auth.clientCredentials(DATA_SCOPES, "data");
    return jsonRequest<AHVResource>(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/verification/account-holder`,
      headers: bearerHeaders(token),
      body: params,
    });
  }

  async getAccountHolderVerification(verificationId: string): Promise<AHVResource> {
    const token = await this.auth.clientCredentials(DATA_SCOPES, "data");
    return withRetry({ maxAttempts: this.config.maxRetries, baseDelayMs: this.config.baseRetryDelayMs, maxDelayMs: 10_000, multiplier: 2 }, () =>
      jsonRequest<AHVResource>(this.config, {
        method: "GET",
        url: `${this.config.apiUrl}/verification/account-holder/${verificationId}`,
        headers: bearerHeaders(token),
      }),
    );
  }
}
