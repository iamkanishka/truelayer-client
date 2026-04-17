import { buildConfig, type ClientOptions, type Config } from "./config.js";
import { createSigner, type Signer } from "./signing.js";
import { IdempotencyManager } from "./idempotency.js";
import { MemoryTokenStore } from "./auth/token-store.js";
import { AuthClient } from "./auth/auth.js";
import { PaymentsClient } from "./payments/payments.js";
import { PayoutsClient } from "./payouts/payouts.js";
import { MerchantClient } from "./merchant/merchant.js";
import { MandatesClient } from "./mandates/mandates.js";
import { DataClient } from "./data/data.js";
import { VerificationClient } from "./verification/verification.js";
import { SignupPlusClient } from "./signup-plus/signup-plus.js";
import { TrackingClient } from "./tracking/tracking.js";
import { WebhooksClient } from "./webhooks/webhooks.js";

/**
 * Main TrueLayer client — the entry point for all API operations.
 *
 * Create via the async factory `TruelayerBankClient.create()`, which validates
 * configuration and imports the signing key asynchronously.
 *
 * @example
 * const client = await TruelayerBankClient.create({
 *   environment: "sandbox",
 *   clientId: process.env.TRUELAYER_CLIENT_ID!,
 *   clientSecret: process.env.TRUELAYER_CLIENT_SECRET!,
 *   signingKeyPem: await fs.readFile("signing_key.pem", "utf-8"),
 *   signingKeyId: process.env.TRUELAYER_KEY_ID!,
 *   webhookSigningSecret: process.env.TRUELAYER_WEBHOOK_SECRET!,
 * });
 */
export class TruelayerBankClient {
  /** OAuth2 authentication and token lifecycle. */
  readonly auth: AuthClient;
  /** Payments API v3. */
  readonly payments: PaymentsClient;
  /** Payouts API. */
  readonly payouts: PayoutsClient;
  /** Merchant Accounts API. */
  readonly merchant: MerchantClient;
  /** Mandates (VRP) API. */
  readonly mandates: MandatesClient;
  /** Data API v1. */
  readonly data: DataClient;
  /** Verification API. */
  readonly verification: VerificationClient;
  /** Signup+ API. */
  readonly signupPlus: SignupPlusClient;
  /** Tracking API. */
  readonly tracking: TrackingClient;
  /** Webhook verification and dispatch. */
  readonly webhooks: WebhooksClient;

  private constructor(
    readonly config: Config,
    readonly storeId: string,
    private readonly signer: Signer | null,
    private readonly idempotency: IdempotencyManager,
  ) {
    const store = config.tokenStore ?? new MemoryTokenStore();
    const configWithStore = { ...config, tokenStore: store };

    this.auth = new AuthClient(configWithStore, storeId, store);
    this.payments = new PaymentsClient(configWithStore, this.auth, signer, idempotency);
    this.payouts = new PayoutsClient(configWithStore, this.auth, signer, idempotency);
    this.merchant = new MerchantClient(configWithStore, this.auth);
    this.mandates = new MandatesClient(configWithStore, this.auth, signer, idempotency);
    this.data = new DataClient(configWithStore, this.auth);
    this.verification = new VerificationClient(configWithStore, this.auth);
    this.signupPlus = new SignupPlusClient(configWithStore, this.auth);
    this.tracking = new TrackingClient(configWithStore, this.auth);
    this.webhooks = new WebhooksClient(configWithStore);
  }

  /**
   * Create and configure a `TruelayerBankClient`.
   *
   * This is an async factory because it imports the signing key via
   * the Web Crypto API, which requires an async operation.
   */
  static async create(opts: ClientOptions): Promise<TruelayerBankClient> {
    const config = buildConfig(opts);

    const signer =
      config.signingKeyPem && config.signingKeyId
        ? await createSigner(config.signingKeyPem, config.signingKeyId)
        : null;

    const storeId = generateStoreId();
    const idempotency = new IdempotencyManager();

    return new TruelayerBankClient(config, storeId, signer, idempotency);
  }

  /** Whether the client is targeting the Sandbox environment. */
  get isSandbox(): boolean {
    return this.config.environment === "sandbox";
  }

  /** The configured environment. */
  get environment(): "sandbox" | "live" {
    return this.config.environment;
  }
}

function generateStoreId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
