import { TruelayerError } from "../error.js";
import { formPost, jsonRequest } from "../http.js";
import type { Config } from "../config.js";
import type { TokenStore } from "./token-store.js";
import {
  bearerHeaders,
  isExpired,
  tokenFromResponse,
  type Token,
  type TokenType,
} from "./token.js";

export const PAYMENTS_SCOPES = ["payments"] as const;
export const DATA_SCOPES = [
  "accounts",
  "balance",
  "transactions",
  "cards",
  "info",
  "offline_access",
] as const;

export interface AuthLinkOptions {
  scopes: string[];
  state: string;
  nonce?: string;
  providers?: string[];
  enableMock?: boolean;
}

/**
 * TrueLayer Authentication client.
 *
 * Manages the full OAuth2 token lifecycle:
 * - Authorization link generation for user-facing redirect flows
 * - Authorization code → token exchange
 * - Client-credentials token acquisition with caching
 * - Automatic token refresh on expiry
 *
 * ## Token isolation
 * `"payments"` and `"data"` tokens are stored in separate slots.
 * A Data token can never authorise a Payments API call.
 */
export class AuthClient {
  constructor(
    private readonly config: Config,
    private readonly storeId: string,
    private readonly store: TokenStore,
  ) {}

  // ── Auth link ───────────────────────────────────────────────────────────────

  /**
   * Generate an OAuth2 authorization URL to redirect the user to for bank login.
   *
   * @example
   * const url = client.auth.authLink({
   *   scopes: ["payments"],
   *   state: csrfToken, // always validate on the redirect callback!
   * });
   * res.redirect(url);
   */
  authLink(opts: AuthLinkOptions): string {
    if (!opts.scopes.length) {
      throw TruelayerError.validation("scopes must not be empty");
    }
    if (!opts.state || opts.state.trim() === "") {
      throw TruelayerError.validation("state is required for CSRF protection");
    }
    if (!this.config.redirectUri) {
      throw TruelayerError.validation("redirectUri is required for authorization-code flows");
    }

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: opts.scopes.join(" "),
      state: opts.state,
    });

    if (opts.nonce) params.set("nonce", opts.nonce);
    if (opts.providers?.length) params.set("providers", opts.providers.join(" "));
    if (opts.enableMock) params.set("enable_mock", "true");

    return `${this.config.authUrl}/?${params.toString()}`;
  }

  // ── Code exchange ───────────────────────────────────────────────────────────

  /**
   * Exchange an authorization code for an access token.
   * The token is cached automatically.
   */
  async exchangeCode(code: string, tokenType: TokenType): Promise<Token> {
    if (!this.config.redirectUri) {
      throw TruelayerError.validation("redirectUri is required for code exchange");
    }
    const resp = await formPost<Record<string, unknown>>(
      this.config,
      `${this.config.authUrl}/connect/token`,
      {
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
      },
    );
    const token = tokenFromResponse(resp, tokenType);
    await this.store.put(this.storeId, tokenType, token);
    return token;
  }

  // ── Client credentials ──────────────────────────────────────────────────────

  /**
   * Obtain a client-credentials token (server-to-server, no user interaction).
   * Results are cached; a fresh token is fetched only when the cached one expires.
   */
  async clientCredentials(scopes: readonly string[], tokenType: TokenType): Promise<Token> {
    const cached = await this.store.get(this.storeId, tokenType);
    if (cached !== null && !isExpired(cached)) return cached;

    const resp = await formPost<Record<string, unknown>>(
      this.config,
      `${this.config.authUrl}/connect/token`,
      {
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: [...scopes].join(" "),
      },
    );
    const token = tokenFromResponse(resp, tokenType);
    await this.store.put(this.storeId, tokenType, token);
    return token;
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  /**
   * Refresh an access token using its refresh_token.
   * Called automatically by `validToken()` when the cached token is expired.
   */
  async refreshToken(refreshTokenValue: string, tokenType: TokenType): Promise<Token> {
    const resp = await formPost<Record<string, unknown>>(
      this.config,
      `${this.config.authUrl}/connect/token`,
      {
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshTokenValue,
      },
    );
    const token = tokenFromResponse(resp, tokenType);
    await this.store.put(this.storeId, tokenType, token);
    return token;
  }

  // ── Valid token ─────────────────────────────────────────────────────────────

  /**
   * Return a valid, non-expired token for `tokenType`.
   * Auto-refreshes using the stored refresh_token if the token is expired.
   * Throws `TruelayerError` with `type: "auth_error"` if no token is stored.
   */
  async validToken(tokenType: TokenType): Promise<Token> {
    const cached = await this.store.get(this.storeId, tokenType);
    if (cached === null) {
      throw new TruelayerError({
        type: "auth_error",
        message: `No ${tokenType} token stored. Complete an OAuth2 flow first.`,
      });
    }
    if (!isExpired(cached)) return cached;
    if (!cached.refreshToken) {
      throw new TruelayerError({
        type: "auth_error",
        message: `${tokenType} token expired and no refresh_token is available.`,
      });
    }
    return this.refreshToken(cached.refreshToken, tokenType);
  }

  // ── Credential management ───────────────────────────────────────────────────

  /** Delete a stored credential (DELETE /connect/token/{credentialsId}). */
  async deleteCredential(credentialsId: string): Promise<void> {
    const token = await this.validToken("data");
    await jsonRequest(this.config, {
      method: "DELETE",
      url: `${this.config.authUrl}/connect/token/${credentialsId}`,
      headers: bearerHeaders(token),
    });
  }
}
