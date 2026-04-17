import { jsonRequest } from "../http.js";
import { withRetry } from "../retry.js";
import { PAYMENTS_SCOPES, type AuthClient } from "../auth/auth.js";
import type { Config } from "../config.js";
import { bearerHeaders } from "../auth/token.js";

export class TrackingClient {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthClient,
  ) {}

  async getTrackedEvents(flowId: string): Promise<unknown[]> {
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
          url: `${this.config.apiUrl}/events/${flowId}`,
          headers: bearerHeaders(token),
        }),
    );
    return resp.items ?? [];
  }
}
