import { TruelayerError } from "./error.js";
import type { TokenStore } from "./auth/token-store.js";
import type { TelemetryHook } from "./http.js";

export type Environment = "sandbox" | "live";

const ENV_URLS: Record<Environment, { api: string; auth: string }> = {
  sandbox: {
    api: "https://api.truelayer-sandbox.com",
    auth: "https://auth.truelayer-sandbox.com",
  },
  live: {
    api: "https://api.truelayer.com",
    auth: "https://auth.truelayer.com",
  },
};

export interface ClientOptions {
  /** OAuth2 client ID from the TrueLayer Console (required). */
  clientId: string;
  /** OAuth2 client secret (required). */
  clientSecret: string;
  /** Target environment. Defaults to `"sandbox"`. */
  environment?: Environment;
  /** OAuth2 redirect URI for authorization-code flows. */
  redirectUri?: string;
  /** PEM-encoded EC private key for ES512 request signing (required for Payments/Payouts/Mandates). */
  signingKeyPem?: string;
  /** Key ID registered in the TrueLayer Console. */
  signingKeyId?: string;
  /** HMAC-SHA256 secret for webhook signature verification. */
  webhookSigningSecret?: string;
  /** Maximum accepted webhook age in seconds. Default: 300. */
  webhookReplayToleranceSec?: number;
  /** HTTP request timeout in milliseconds. Default: 30_000. */
  requestTimeoutMs?: number;
  /** Maximum number of retry attempts. Default: 3. */
  maxRetries?: number;
  /** Base exponential backoff delay in milliseconds. Default: 300. */
  baseRetryDelayMs?: number;
  /** Custom token store implementation. Defaults to in-memory store. */
  tokenStore?: TokenStore;
  /** Telemetry hook called after each HTTP request. */
  onRequest?: TelemetryHook;
}

export interface Config {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly environment: Environment;
  readonly apiUrl: string;
  readonly authUrl: string;
  readonly redirectUri?: string;
  readonly signingKeyPem?: string;
  readonly signingKeyId?: string;
  readonly webhookSigningSecret?: string;
  readonly webhookReplayToleranceSec: number;
  readonly requestTimeoutMs: number;
  readonly maxRetries: number;
  readonly baseRetryDelayMs: number;
  readonly tokenStore?: TokenStore;
  readonly onRequest?: TelemetryHook;
}

/**
 * Validate and build a `Config` from raw `ClientOptions`.
 * Throws `TruelayerError` with `type: "validation_error"` on invalid input.
 */
export function buildConfig(opts: ClientOptions): Config {
  if (!opts.clientId || opts.clientId.trim() === "") {
    throw TruelayerError.validation("clientId is required and must not be empty");
  }
  if (!opts.clientSecret || opts.clientSecret.trim() === "") {
    throw TruelayerError.validation(
      "clientSecret is required and must not be empty",
    );
  }

  const env: Environment = opts.environment ?? "sandbox";
  if (!(env in ENV_URLS)) {
    throw TruelayerError.validation(
      `environment must be "sandbox" or "live", got: "${env}"`,
    );
  }

  const urls = ENV_URLS[env];
  if (!urls) {
    // This should never happen since we validated env above
    throw TruelayerError.validation(`no URLs configured for environment "${env}"`);
  }

  return {
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    environment: env,
    apiUrl: urls.api,
    authUrl: urls.auth,
    redirectUri: opts.redirectUri,
    signingKeyPem: opts.signingKeyPem,
    signingKeyId: opts.signingKeyId,
    webhookSigningSecret: opts.webhookSigningSecret,
    webhookReplayToleranceSec: opts.webhookReplayToleranceSec ?? 300,
    requestTimeoutMs: opts.requestTimeoutMs ?? 30_000,
    maxRetries: opts.maxRetries ?? 3,
    baseRetryDelayMs: opts.baseRetryDelayMs ?? 300,
    tokenStore: opts.tokenStore,
    onRequest: opts.onRequest,
  };
}
