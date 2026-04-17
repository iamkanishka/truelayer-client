import { describe, it, expect } from "vitest";
import { mockFetch } from "../helpers.js";
import { buildConfig } from "../../src/config.js";
import { AuthClient } from "../../src/auth/auth.js";
import { PayoutsClient } from "../../src/payouts/payouts.js";
import { IdempotencyManager } from "../../src/idempotency.js";
import { MemoryTokenStore } from "../../src/auth/token-store.js";
import { tokenFromResponse } from "../../src/auth/token.js";

const cfg = buildConfig({ clientId: "id", clientSecret: "s", environment: "sandbox", maxRetries: 1, baseRetryDelayMs: 1 });

async function makeClient() {
  const store = new MemoryTokenStore();
  await store.put("sid", "payments", tokenFromResponse({ access_token: "tok", expires_in: 3600, token_type: "Bearer", scope: "payments" }, "payments"));
  const auth = new AuthClient({ ...cfg, tokenStore: store }, "sid", store);
  return new PayoutsClient({ ...cfg, tokenStore: store }, auth, null, new IdempotencyManager());
}

describe("PayoutsClient", () => {
  it("getPayout returns payout data", async () => {
    mockFetch(200, { id: "po_001", amount_in_minor: 5000, currency: "GBP", status: "executed" });
    const client = await makeClient();
    const payout = await client.getPayout("po_001");
    expect(payout.id).toBe("po_001");
    expect(payout.status).toBe("executed");
  });

  it("getPayout throws not_found on 404", async () => {
    mockFetch(404, { title: "Not Found" });
    const client = await makeClient();
    await expect(client.getPayout("nope")).rejects.toMatchObject({ type: "not_found" });
  });

  it("createPayout throws signing_required when no signer", async () => {
    const client = await makeClient();
    await expect(
      client.createPayout({ merchant_account_id: "ma", amount_in_minor: 1000, currency: "GBP", beneficiary: { type: "external_account", account_holder_name: "Jane", account_identifier: { type: "iban", iban: "GB29NWBK" } } }, "op"),
    ).rejects.toMatchObject({ type: "signing_required" });
  });
});
