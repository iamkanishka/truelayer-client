import { describe, it, expect, vi } from "vitest";
import { mockFetch, mockFetchSequence } from "../helpers.js";
import { buildConfig } from "../../src/config.js";
import { AuthClient } from "../../src/auth/auth.js";
import { PaymentsClient } from "../../src/payments/payments.js";
import { IdempotencyManager } from "../../src/idempotency.js";
import { MemoryTokenStore } from "../../src/auth/token-store.js";
import { TruelayerError } from "../../src/error.js";
import { tokenFromResponse } from "../../src/auth/token.js";

const cfg = buildConfig({
  clientId: "test-id",
  clientSecret: "test-secret",
  environment: "sandbox",
  maxRetries: 1,
  baseRetryDelayMs: 1,
});

const TOKEN_RESP = {
  access_token: "payments-token",
  expires_in: 3600,
  token_type: "Bearer",
  scope: "payments",
};

async function makeClient() {
  const store = new MemoryTokenStore();
  const token = tokenFromResponse(TOKEN_RESP, "payments");
  await store.put("sid", "payments", token);
  const config = { ...cfg, tokenStore: store };
  const auth = new AuthClient(config, "sid", store);
  const idempotency = new IdempotencyManager();
  // null signer — tests that need signing will verify the error
  return new PaymentsClient(config, auth, null, idempotency);
}

describe("PaymentsClient.getPayment", () => {
  it("returns payment data", async () => {
    mockFetch(200, { id: "pay_001", status: "executed", amount_in_minor: 1000, currency: "GBP" });
    const client = await makeClient();
    const result = await client.getPayment("pay_001");
    expect(result.id).toBe("pay_001");
    expect(result.status).toBe("executed");
  });

  it("throws TruelayerError on 404", async () => {
    mockFetch(404, { title: "Not Found", detail: "Payment not found" });
    const client = await makeClient();
    await expect(client.getPayment("nope")).rejects.toBeInstanceOf(TruelayerError);
    await expect(client.getPayment("nope")).rejects.toMatchObject({ type: "not_found" });
  });

  it("surfaces tl-trace-id from error response", async () => {
    mockFetch(401, { title: "Unauthorized" }, { "tl-trace-id": "trace-abc" });
    const client = await makeClient();
    const err = await client.getPayment("bad").catch((e) => e as TruelayerError);
    expect(err.traceId).toBe("trace-abc");
  });
});

describe("PaymentsClient.createPayment", () => {
  it("throws signing_required when no signer configured", async () => {
    const client = await makeClient();
    await expect(
      client.createPayment({ amount_in_minor: 1000, currency: "GBP", payment_method: {} as never, user: {} }, "op-001"),
    ).rejects.toMatchObject({ type: "signing_required" });
  });
});

describe("PaymentsClient.cancelPayment", () => {
  it("throws signing_required when no signer configured", async () => {
    const client = await makeClient();
    await expect(client.cancelPayment("pay_001")).rejects.toMatchObject({ type: "signing_required" });
  });
});

describe("PaymentsClient.startAuthorizationFlow", () => {
  it("returns flow response", async () => {
    mockFetch(200, {
      status: "authorizing",
      authorization_flow: { actions: { next: { type: "redirect", uri: "https://bank.example.com" } } },
    });
    const client = await makeClient();
    const result = await client.startAuthorizationFlow("pay_001", { redirect: { return_uri: "https://app.com" } });
    expect(result).toMatchObject({ status: "authorizing" });
  });
});

describe("PaymentsClient.submitProviderSelection", () => {
  it("posts provider_id", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
      return new Response(JSON.stringify({ status: "authorizing" }), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
      });
    }));
    const client = await makeClient();
    await client.submitProviderSelection("pay_001", "ob-monzo");
    expect(capturedBody?.provider_id).toBe("ob-monzo");
  });
});

describe("PaymentsClient.listRefunds", () => {
  it("returns refund array", async () => {
    mockFetch(200, { items: [{ id: "ref_001", status: "executed" }, { id: "ref_002", status: "pending" }] });
    const client = await makeClient();
    const refunds = await client.listRefunds("pay_001");
    expect(refunds).toHaveLength(2);
    expect(refunds[0]).toMatchObject({ id: "ref_001" });
  });
});

describe("PaymentsClient.getRefund", () => {
  it("returns a single refund", async () => {
    mockFetch(200, { id: "ref_001", status: "executed", amount_in_minor: 500 });
    const client = await makeClient();
    const refund = await client.getRefund("pay_001", "ref_001");
    expect(refund.id).toBe("ref_001");
    expect(refund.status).toBe("executed");
  });
});

describe("PaymentsClient.getPaymentLink", () => {
  it("returns payment link", async () => {
    mockFetch(200, { id: "link_001", link: "https://pay.truelayer.com/link_001", status: "active" });
    const client = await makeClient();
    const link = await client.getPaymentLink("link_001");
    expect(link.id).toBe("link_001");
    expect(link.status).toBe("active");
  });
});

describe("PaymentsClient.searchProviders", () => {
  it("returns provider list", async () => {
    mockFetch(200, { providers: [{ id: "ob-monzo", display_name: "Monzo" }, { id: "ob-revolut", display_name: "Revolut" }] });
    const client = await makeClient();
    const result = await client.searchProviders({ countries: ["GB"] });
    expect(result.providers).toHaveLength(2);
    expect(result.providers[0]).toMatchObject({ id: "ob-monzo" });
  });
});

describe("PaymentsClient.getProvider", () => {
  it("returns single provider", async () => {
    mockFetch(200, { id: "ob-monzo", display_name: "Monzo", country_code: "GB" });
    const client = await makeClient();
    const provider = await client.getProvider("ob-monzo");
    expect(provider.id).toBe("ob-monzo");
    expect(provider.country_code).toBe("GB");
  });
});

describe("PaymentsClient.waitForFinalStatus", () => {
  it("returns payment when already terminal", async () => {
    mockFetch(200, { id: "pay_001", status: "executed" });
    const client = await makeClient();
    const result = await client.waitForFinalStatus("pay_001");
    expect(result.status).toBe("executed");
  });

  it("polls until terminal status", async () => {
    mockFetchSequence([
      { status: 200, body: { id: "pay_001", status: "authorizing" } },
      { status: 200, body: { id: "pay_001", status: "authorizing" } },
      { status: 200, body: { id: "pay_001", status: "settled" } },
    ]);
    const client = await makeClient();
    const result = await client.waitForFinalStatus("pay_001", { intervalMs: 1 });
    expect(result.status).toBe("settled");
  });

  it("throws timeout error when deadline exceeded", async () => {
    // Use sequence so each poll call gets a fresh Response body
    mockFetchSequence([
      { status: 200, body: { id: "pay_001", status: "authorizing" } },
      { status: 200, body: { id: "pay_001", status: "authorizing" } },
      { status: 200, body: { id: "pay_001", status: "authorizing" } },
      { status: 200, body: { id: "pay_001", status: "authorizing" } },
      { status: 200, body: { id: "pay_001", status: "authorizing" } },
    ]);
    const client = await makeClient();
    await expect(
      client.waitForFinalStatus("pay_001", { timeoutMs: 1, intervalMs: 10 }),
    ).rejects.toMatchObject({ type: "timeout" });
  });
});
