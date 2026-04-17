# Changelog

## [1.0.0] - 2026-04-15

### Added

- `TruelayerClient.create()` — async factory with Web Crypto key import
- `TruelayerError` — rich structured error class with predicates (`isRetryable`, `isNotFound`, etc.)
- `AuthClient` — auth links, code exchange, client credentials, token refresh, `validToken()`
- `MemoryTokenStore` — in-memory token store; interface for Redis/DynamoDB backends
- `PaymentsClient` — full Payments API v3: create/get/cancel, 5-step auth flow, refunds, payment links, provider search, `waitForFinalStatus()`
- `PayoutsClient` — `createPayout`, `getPayout`
- `MerchantClient` — list/get accounts, transactions, sweeping, payment sources
- `MandatesClient` — create, list, get, auth flow, revoke, confirm funds, get constraints
- `DataClient` — accounts, balances, transactions, async generator `transactionStream()`, cards, standing orders, direct debits
- `VerificationClient` — account holder name verification, AHV resource lifecycle
- `SignupPlusClient` — user data by payment/mandate/connected account, generate auth URI
- `TrackingClient` — get tracked events by flow ID
- `WebhooksClient` — HMAC-SHA256 constant-time verification, replay-attack protection, `on()`, `onFallback()`, `process()`
- `IdempotencyManager` — UUID v4 key manager using `crypto.getRandomValues`
- `withRetry()` — exponential backoff with `crypto.getRandomValues` jitter
- `createSigner()` — ES512 JWS via `SubtleCrypto` (zero external deps)
- Dual ESM + CJS build via `tsup`
- Full test suite using Vitest with `vi.stubGlobal("fetch")` — zero live API calls
