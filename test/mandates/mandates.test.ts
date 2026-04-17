import { describe, it, expect } from "vitest";
import { mockFetch } from "../helpers.js";
import { buildConfig } from "../../src/config.js";
import { AuthClient } from "../../src/auth/auth.js";
import { MandatesClient } from "../../src/mandates/mandates.js";
import { IdempotencyManager } from "../../src/idempotency.js";
import { MemoryTokenStore } from "../../src/auth/token-store.js";
import { tokenFromResponse } from "../../src/auth/token.js";

const cfg = buildConfig({ clientId: "id", clientSecret: "s", environment: "sandbox", maxRetries: 1, baseRetryDelayMs: 1 });

async function makeClient() {
  const store = new MemoryTokenStore();
  await store.put("sid", "payments", tokenFromResponse({ access_token: "tok", expires_in: 3600, token_type: "Bearer", scope: "payments" }, "payments"));
  const auth = new AuthClient({ ...cfg, tokenStore: store }, "sid", store);
  return new MandatesClient({ ...cfg, tokenStore: store }, auth, null, new IdempotencyManager());
}

describe("MandatesClient", () => {
  it("createMandate throws signing_required without signer", async () => {
    const client = await makeClient();
    await expect(
      client.createMandate({ mandate_type: "sweeping", currency: "GBP", user: {}, constraints: {}, provider_selection: {} }, "op"),
    ).rejects.toMatchObject({ type: "signing_required" });
  });

  it("getMandate returns mandate", async () => {
    mockFetch(200, { id: "man-001", mandate_type: "sweeping", status: "authorized" });
    const client = await makeClient();
    const mandate = await client.getMandate("man-001");
    expect(mandate.id).toBe("man-001");
    expect(mandate.status).toBe("authorized");
  });

  it("listMandates returns response object", async () => {
    mockFetch(200, { items: [{ id: "man-001" }, { id: "man-002" }] });
    const client = await makeClient();
    const result = await client.listMandates() as { items: unknown[] };
    expect(result.items).toHaveLength(2);
  });

  it("revokeMandate completes without error", async () => {
    mockFetch(200, {});
    const client = await makeClient();
    await expect(client.revokeMandate("man-001")).resolves.toBeUndefined();
  });

  it("confirmFunds returns confirmed result", async () => {
    mockFetch(200, { confirmed: true });
    const client = await makeClient();
    const result = await client.confirmFunds("man-001", 10_000);
    expect(result.confirmed).toBe(true);
  });

  it("getConstraints returns constraints", async () => {
    mockFetch(200, { constraints: { valid_to: "2025-12-31" }, used_amount_in_minor: 0 });
    const client = await makeClient();
    const result = await client.getConstraints("man-001") as { used_amount_in_minor: number };
    expect(result.used_amount_in_minor).toBe(0);
  });

  it("submitProviderSelection posts provider_id", async () => {
    mockFetch(200, { status: "authorizing" });
    const client = await makeClient();
    const result = await client.submitProviderSelection("man-001", "ob-monzo") as { status: string };
    expect(result.status).toBe("authorizing");
  });

  it("submitConsent posts consent true", async () => {
    mockFetch(200, { status: "authorized" });
    const client = await makeClient();
    const result = await client.submitConsent("man-001") as { status: string };
    expect(result.status).toBe("authorized");
  });
});
