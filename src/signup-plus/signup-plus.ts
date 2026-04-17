import { jsonRequest } from "../http.js";
import { bearerHeaders } from "../auth/token.js";
import { PAYMENTS_SCOPES, type AuthClient } from "../auth/auth.js";
import type { Config } from "../config.js";

export class SignupPlusClient {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthClient,
  ) {}

  async getUserDataByPayment(paymentId: string): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "GET",
      url: `${this.config.apiUrl}/signup-plus/data/v1/payments/${paymentId}`,
      headers: bearerHeaders(token),
    });
  }

  async getUserDataByMandate(mandateId: string): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "GET",
      url: `${this.config.apiUrl}/signup-plus/data/v1/mandates/${mandateId}`,
      headers: bearerHeaders(token),
    });
  }

  async getUserDataByConnectedAccount(accountId: string): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "GET",
      url: `${this.config.apiUrl}/signup-plus/data/v1/connected-accounts/${accountId}`,
      headers: bearerHeaders(token),
    });
  }

  async generateAuthUri(params: Record<string, unknown>): Promise<unknown> {
    const token = await this.auth.clientCredentials(PAYMENTS_SCOPES, "payments");
    return jsonRequest(this.config, {
      method: "POST",
      url: `${this.config.apiUrl}/signup-plus/auth-uri`,
      headers: bearerHeaders(token),
      body: { ...params, client_id: this.config.clientId },
    });
  }
}
