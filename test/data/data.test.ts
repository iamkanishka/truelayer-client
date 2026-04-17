import { describe, it, expect, vi } from "vitest";
import { mockFetch } from "../helpers.js";
import { buildConfig } from "../../src/config.js";
import { AuthClient } from "../../src/auth/auth.js";
import { DataClient } from "../../src/data/data.js";
import { MemoryTokenStore } from "../../src/auth/token-store.js";
import { tokenFromResponse } from "../../src/auth/token.js";

const cfg = buildConfig({
  clientId: "id",
  clientSecret: "s",
  environment: "sandbox",
  maxRetries: 1,
  baseRetryDelayMs: 1,
});

async function makeClient() {
  const store = new MemoryTokenStore();
  await store.put(
    "sid",
    "data",
    tokenFromResponse(
      { access_token: "data-tok", expires_in: 3600, token_type: "Bearer", scope: "accounts" },
      "data",
    ),
  );
  const auth = new AuthClient({ ...cfg, tokenStore: store }, "sid", store);
  return new DataClient({ ...cfg, tokenStore: store }, auth);
}

describe("DataClient", () => {
  it("listAccounts returns array", async () => {
    mockFetch(200, {
      results: [
        { account_id: "acc-001", currency: "GBP" },
        { account_id: "acc-002", currency: "GBP" },
      ],
    });
    const client = await makeClient();
    const accounts = await client.listAccounts();
    expect(accounts).toHaveLength(2);
  });

  it("getAccount returns single account", async () => {
    mockFetch(200, { results: [{ account_id: "acc-001", currency: "GBP" }] });
    const client = await makeClient();
    const account = (await client.getAccount("acc-001")) as { account_id: string };
    expect(account.account_id).toBe("acc-001");
  });

  it("getAccount throws not_found for empty results", async () => {
    mockFetch(200, { results: [] });
    const client = await makeClient();
    await expect(client.getAccount("nope")).rejects.toMatchObject({ type: "not_found" });
  });

  it("getAccountBalance returns balance", async () => {
    mockFetch(200, { results: [{ available: 100.5, current: 100.5, currency: "GBP" }] });
    const client = await makeClient();
    const bal = (await client.getAccountBalance("acc-001")) as { currency: string };
    expect(bal.currency).toBe("GBP");
  });

  it("getTransactions returns array of transactions", async () => {
    mockFetch(200, {
      results: [
        { transaction_id: "t1", amount: -10.0 },
        { transaction_id: "t2", amount: 500.0 },
      ],
    });
    const client = await makeClient();
    const txns = await client.getTransactions("acc-001");
    expect(txns).toHaveLength(2);
  });

  it("getTransactions passes from/to as query params", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url as string;
        return new Response(JSON.stringify({ results: [] }), {
          status: 200,
          headers: new Headers({ "Content-Type": "application/json" }),
        });
      }),
    );
    const client = await makeClient();
    await client.getTransactions("acc-001", {
      from: new Date("2024-01-01"),
      to: new Date("2024-03-31"),
    });
    expect(capturedUrl).toContain("from=");
    expect(capturedUrl).toContain("to=");
  });

  it("transactionStream yields all transactions", async () => {
    mockFetch(200, {
      results: [{ transaction_id: "t1" }, { transaction_id: "t2" }, { transaction_id: "t3" }],
    });
    const client = await makeClient();
    const collected: unknown[] = [];
    for await (const t of client.transactionStream("acc-001")) {
      collected.push(t);
    }
    expect(collected).toHaveLength(3);
  });

  it("transactionStream supports filter composition", async () => {
    mockFetch(200, { results: [{ amount: -10 }, { amount: 500 }, { amount: -5 }] });
    const client = await makeClient();
    const credits: unknown[] = [];
    for await (const t of client.transactionStream("acc-001")) {
      if ((t as { amount: number }).amount > 0) credits.push(t);
    }
    expect(credits).toHaveLength(1);
  });

  it("listCards returns card array", async () => {
    mockFetch(200, { results: [{ account_id: "card-001", card_network: "VISA" }] });
    const client = await makeClient();
    const cards = await client.listCards();
    expect(cards).toHaveLength(1);
  });

  it("getCardBalance returns card balance", async () => {
    mockFetch(200, { results: [{ current: -50.25, credit_limit: 1000.0, currency: "GBP" }] });
    const client = await makeClient();
    const bal = (await client.getCardBalance("card-001")) as { currency: string };
    expect(bal.currency).toBe("GBP");
  });

  it("getStandingOrders returns array", async () => {
    mockFetch(200, { results: [{ standing_order_id: "so-001", frequency: "Monthly" }] });
    const client = await makeClient();
    const orders = await client.getStandingOrders("acc-001");
    expect(orders).toHaveLength(1);
  });

  it("getDirectDebits returns array", async () => {
    mockFetch(200, { results: [{ mandate_id: "dd-001" }] });
    const client = await makeClient();
    const dds = await client.getDirectDebits("acc-001");
    expect(dds).toHaveLength(1);
  });
});
