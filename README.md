# truelayer-bank-client

[![npm](https://img.shields.io/npm/v/ truelayer-bank-client)](https://www.npmjs.com/package/ truelayer-bank-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Production-grade TypeScript client for the [TrueLayer](https://truelayer.com) open banking API.

**Zero external dependencies.** ES512 request signing uses `SubtleCrypto`. HMAC-SHA256 webhook verification uses `SubtleCrypto`. Jitter uses `crypto.getRandomValues`. Works natively in **Node 18+**, Deno, Bun, and the browser.

---

## Installation

```bash
npm install  truelayer-bank-client
```

## Requirements

- Node.js ≥ 18.0.0 (for native `fetch` and `crypto.subtle`)

---

## Quick Start

```typescript
import { TruelayerBankClient } from " truelayer-bank-client";
import { readFile } from "fs/promises";

const client = await TruelayerBankClient.create({
  environment: "sandbox",
  clientId: process.env.TRUELAYER_CLIENT_ID!,
  clientSecret: process.env.TRUELAYER_CLIENT_SECRET!,
  redirectUri: "https://yourapp.com/callback",
  signingKeyPem: await readFile("keys/signing_private.pem", "utf-8"),
  signingKeyId: process.env.TRUELAYER_KEY_ID!,
  webhookSigningSecret: process.env.TRUELAYER_WEBHOOK_SECRET!,
});
```

---

## API Modules

| Module | Responsibility |
|--------|----------------|
| `client.auth` | OAuth2 tokens, auth links |
| `client.payments` | Pay-ins, auth flow, refunds, payment links, polling |
| `client.payouts` | Merchant-account payouts |
| `client.merchant` | Merchant accounts, sweeping |
| `client.mandates` | VRP / sweeping mandates |
| `client.data` | Accounts, balances, transactions (async generator), cards |
| `client.verification` | Account holder name verification |
| `client.signupPlus` | Embedded user-data collection |
| `client.tracking` | Auth-flow event tracking |
| `client.webhooks` | HMAC-SHA256 verification + typed dispatch |

---

## Authentication

```typescript
// Generate bank login URL
const url = client.auth.authLink({
  scopes: ["payments"],
  state: csrfToken, // always validate on redirect!
});

// Exchange code for token (in OAuth2 callback handler)
const token = await client.auth.exchangeCode(code, "payments");

// Client credentials (auto-cached and refreshed)
const token = await client.auth.clientCredentials(["payments"], "payments");
```

### Custom token store (Redis, DynamoDB…)

```typescript
import type { TokenStore } from " truelayer-bank-client";

class RedisTokenStore implements TokenStore {
  async get(storeId, tokenType) { /* ... */ }
  async put(storeId, tokenType, token) { /* ... */ }
  async delete(storeId, tokenType) { /* ... */ }
}

const client = await TruelayerBankClient.create({
  clientId: "...",
  clientSecret: "...",
  tokenStore: new RedisTokenStore(),
});
```

---

## Payments

```typescript
// Create a payment
const payment = await client.payments.createPayment(
  {
    amount_in_minor: 1000,
    currency: "GBP",
    payment_method: {
      type: "bank_transfer",
      provider_selection: { type: "user_selected" },
      beneficiary: { type: "merchant_account", merchant_account_id: maId },
    },
    user: { name: "Jane Doe", email: "jane@example.com" },
  },
  "order-001", // operationId — same value = safe retry
);

// Auth flow
await client.payments.startAuthorizationFlow(payment.id, {
  redirect: { return_uri: "https://yourapp.com/return" },
});
await client.payments.submitProviderSelection(payment.id, "ob-monzo");
await client.payments.submitConsent(payment.id);

// Poll for final status (prefer webhooks in production)
const final = await client.payments.waitForFinalStatus(payment.id, {
  timeoutMs: 60_000,
  intervalMs: 2_000,
});
```

---

## Data API — Async Generator Streaming

```typescript
// Lazy transaction stream — yields one transaction at a time
for await (const txn of client.data.transactionStream(accountId, {
  from: new Date("2024-01-01"),
  to: new Date("2024-03-31"),
})) {
  if ((txn as any).amount < 0) {
    console.log("Debit:", txn);
  }
}
```

---

## Webhooks

```typescript
// Register typed handlers
client.webhooks
  .on(WebhookEvents.PAYMENT_EXECUTED, async (event) => {
    const { payment_id } = event.payload;
    await db.payments.markExecuted(payment_id as string);
  })
  .on(WebhookEvents.PAYMENT_FAILED, async (event) => {
    const { payment_id, failure_reason } = event.payload;
    await db.payments.markFailed(payment_id as string, failure_reason as string);
  })
  .on(WebhookEvents.REFUND_EXECUTED, async (event) => {
    await handleRefund(event);
  })
  .onFallback(async (event) => {
    console.warn("Unhandled webhook:", event.event_type);
  });

// In your Express/Fastify/Next.js handler (raw body required):
app.post("/webhooks/truelayer", express.raw({ type: "*/*" }), async (req, res) => {
  const sig = req.headers["tl-signature"] as string;
  const ts  = req.headers["tl-timestamp"] as string;
  try {
    await client.webhooks.process(req.body, sig, ts);
    res.status(200).end();
  } catch (err) {
    if (err instanceof TruelayerError && err.type === "signature_invalid") {
      res.status(401).json({ error: "invalid signature" });
    } else if (err instanceof TruelayerError && err.type === "replay_attack") {
      res.status(401).json({ error: "event too old" });
    } else {
      res.status(500).json({ error: "internal error" });
    }
  }
});
```

---

## Error Handling

```typescript
import { TruelayerError } from " truelayer-bank-client";

try {
  const payment = await client.payments.getPayment(paymentId);
} catch (err) {
  if (err instanceof TruelayerError) {
    if (err.isNotFound) return null;
    if (err.isRateLimited) { /* back off */ }
    if (err.isServerError) { /* retry later */ }
    // Always available for support tickets:
    console.error("TrueLayer error", { traceId: err.traceId, message: err.message });
  }
  throw err;
}
```

---

## Telemetry

```typescript
const client = await TruelayerBankClient.create({
  clientId: "...",
  clientSecret: "...",
  onRequest: ({ method, url, status, durationMs }) => {
    metrics.histogram("truelayer.request.duration", durationMs, {
      method,
      status: String(status),
    });
  },
});
```

---

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientId` | `string` | required | OAuth2 client ID |
| `clientSecret` | `string` | required | OAuth2 client secret |
| `environment` | `"sandbox" \| "live"` | `"sandbox"` | API environment |
| `redirectUri` | `string` | `undefined` | Required for auth-code flows |
| `signingKeyPem` | `string` | `undefined` | PKCS8 PEM key (required for Payments/Payouts/Mandates) |
| `signingKeyId` | `string` | `undefined` | Key ID from TrueLayer Console |
| `webhookSigningSecret` | `string` | `undefined` | HMAC-SHA256 webhook secret |
| `webhookReplayToleranceSec` | `number` | `300` | Max accepted webhook age |
| `requestTimeoutMs` | `number` | `30_000` | HTTP request timeout |
| `maxRetries` | `number` | `3` | Retry attempts |
| `baseRetryDelayMs` | `number` | `300` | Base backoff delay |
| `tokenStore` | `TokenStore` | `MemoryTokenStore` | Custom token store |
| `onRequest` | `TelemetryHook` | `undefined` | Called after each HTTP request |

---

## License

MIT — see [LICENSE](LICENSE).
