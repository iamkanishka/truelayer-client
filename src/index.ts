/**
 *  truelayer-bank-client
 *
 * Production-grade TypeScript client for the TrueLayer open banking API.
 * Zero external dependencies. Works in Node 18+, Deno, Bun, and browsers.
 */

// ── Main client ───────────────────────────────────────────────────────────────
export { TruelayerBankClient } from "./client.js";

// ── Error ─────────────────────────────────────────────────────────────────────
export { TruelayerError } from "./error.js";
export type { ErrorType, FieldError } from "./error.js";

// ── Config ────────────────────────────────────────────────────────────────────
export type { ClientOptions, Config, Environment } from "./config.js";

// ── Auth ──────────────────────────────────────────────────────────────────────
export { AuthClient, PAYMENTS_SCOPES, DATA_SCOPES } from "./auth/auth.js";
export type { AuthLinkOptions } from "./auth/auth.js";
export { MemoryTokenStore } from "./auth/token-store.js";
export type { TokenStore } from "./auth/token-store.js";
export {
  tokenFromResponse,
  isExpired,
  bearerHeaders,
  bearerToken,
  bearerHeader,
} from "./auth/token.js";
export type { Token, TokenType } from "./auth/token.js";

// ── Payments ──────────────────────────────────────────────────────────────────
export { PaymentsClient } from "./payments/payments.js";
export type {
  CreatePaymentRequest,
  CreatedPayment,
  Payment,
  PaymentStatus,
  CreateRefundRequest,
  Refund,
  RefundStatus,
  CreatePaymentLinkRequest,
  PaymentLink,
  PaymentLinkStatus,
  Provider,
  Beneficiary,
  AccountIdentifier,
  PaymentMethod,
  PaymentUser,
  ProviderSelection,
} from "./payments/types.js";

// ── Payouts ───────────────────────────────────────────────────────────────────
export { PayoutsClient } from "./payouts/payouts.js";
export type {
  CreatePayoutRequest,
  Payout,
  PayoutStatus,
  PayoutBeneficiary,
} from "./payouts/types.js";

// ── Merchant ──────────────────────────────────────────────────────────────────
export { MerchantClient } from "./merchant/merchant.js";
export type {
  MerchantAccount,
  MerchantTransaction,
  SweepingConfig,
} from "./merchant/merchant.js";

// ── Mandates ──────────────────────────────────────────────────────────────────
export { MandatesClient } from "./mandates/mandates.js";
export type {
  CreateMandateRequest,
  Mandate,
  MandateStatus,
} from "./mandates/mandates.js";

// ── Data ──────────────────────────────────────────────────────────────────────
export { DataClient } from "./data/data.js";

// ── Verification ──────────────────────────────────────────────────────────────
export { VerificationClient } from "./verification/verification.js";
export type {
  VerifyNameRequest,
} from "./verification/verification.js";

// ── Signup+ ───────────────────────────────────────────────────────────────────
export { SignupPlusClient } from "./signup-plus/signup-plus.js";

// ── Tracking ──────────────────────────────────────────────────────────────────
export { TrackingClient } from "./tracking/tracking.js";

// ── Webhooks ──────────────────────────────────────────────────────────────────
export { WebhooksClient, WebhookEvents } from "./webhooks/webhooks.js";
export type {
  WebhookEvent,
  WebhookEventType,
  WebhookHandler,
} from "./webhooks/webhooks.js";

// ── Internals (useful for custom implementations) ─────────────────────────────
export { IdempotencyManager } from "./idempotency.js";
export { withRetry } from "./retry.js";
export type { RetryPolicy } from "./retry.js";
export { createSigner } from "./signing.js";
export type { Signer } from "./signing.js";
