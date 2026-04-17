import { describe, it, expect, vi } from "vitest";
import { mockFetch } from "../helpers.js";
import { buildConfig } from "../../src/config.js";
import { AuthClient } from "../../src/auth/auth.js";
import { MerchantClient } from "../../src/merchant/merchant.js";
import { MemoryTokenStore } from "../../src/auth/token-store.js";
import { tokenFromResponse } from "../../src/auth/token.js";

const cfg = buildConfig({ clientId: "id", clientSecret: "s", environment: "sandbox", maxRetries: 1, baseRetryDelayMs: 1 });

async function makeClient() {
  const store = new MemoryTokenStore();
  await store.put("sid", "payments", tokenFromResponse({ access_token: "tok", expires_in: 3600, token_type: "Bearer", scope: "payments" }, "payments"));
  const auth = new AuthClient({ ...cfg, tokenStore: store }, "sid", store);
  return new MerchantClient({ ...cfg, tokenStore: store }, auth);
}

describe("MerchantClient", () => {
  it("listAccounts returns array", async () => {
    mockFetch(200, { items: [{ id: "ma-001", currency: "GBP", available_balance_in_minor: 100_000 }] });
    const client = await makeClient();
    const accounts = await client.listAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: "ma-001" });
  });

  it("getAccount returns single account", async () => {
    mockFetch(200, { id: "ma-001", currency: "GBP" });
    const client = await makeClient();
    const account = await client.getAccount("ma-001");
    expect(account.id).toBe("ma-001");
  });

  it("getAccount throws not_found on 404", async () => {
    mockFetch(404, { title: "Not Found" });
    const client = await makeClient();
    await expect(client.getAccount("gone")).rejects.toMatchObject({ type: "not_found" });
  });

  it("getTransactions passes query params", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url as string;
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: new Headers({ "Content-Type": "application/json" }) });
    }));
    const client = await makeClient();
    await client.getTransactions("ma-001", { type: "payout", from: "2024-01-01" });
    expect(capturedUrl).toContain("type=payout");
    expect(capturedUrl).toContain("from=2024-01-01");
  });

  it("setupSweeping returns config", async () => {
    mockFetch(200, { max_amount_in_minor: 100_000, currency: "GBP", frequency: "daily" });
    const client = await makeClient();
    const cfg2 = await client.setupSweeping("ma-001", { max_amount_in_minor: 100_000, currency: "GBP", frequency: "daily" });
    expect(cfg2.frequency).toBe("daily");
  });

  it("disableSweeping completes without error", async () => {
    mockFetch(200, {});
    const client = await makeClient();
    await expect(client.disableSweeping("ma-001")).resolves.toBeUndefined();
  });

  it("getPaymentSources returns array", async () => {
    mockFetch(200, { items: [{ id: "ps-001", account_holder_name: "Jane" }] });
    const client = await makeClient();
    const sources = await client.getPaymentSources("ma-001");
    expect(sources).toHaveLength(1);
  });
});
