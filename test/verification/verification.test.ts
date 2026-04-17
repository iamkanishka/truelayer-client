import { describe, it, expect } from "vitest";
import { mockFetch } from "../helpers.js";
import { buildConfig } from "../../src/config.js";
import { AuthClient } from "../../src/auth/auth.js";
import { VerificationClient } from "../../src/verification/verification.js";
import { MemoryTokenStore } from "../../src/auth/token-store.js";
import { tokenFromResponse } from "../../src/auth/token.js";

const cfg = buildConfig({
  clientId: "id",
  clientSecret: "s",
  environment: "sandbox",
  maxRetries: 1,
  baseRetryDelayMs: 1,
});

// Pre-load a data token into the store so verification calls skip the token endpoint
async function makeClient() {
  const store = new MemoryTokenStore();
  const token = tokenFromResponse(
    { access_token: "data-tok", expires_in: 3600, token_type: "Bearer", scope: "accounts" },
    "data",
  );
  await store.put("sid", "data", token);
  const auth = new AuthClient({ ...cfg, tokenStore: store }, "sid", store);
  return new VerificationClient({ ...cfg, tokenStore: store }, auth);
}

describe("VerificationClient", () => {
  it("verifyAccountHolderName throws validation_error when name is empty", async () => {
    const client = await makeClient();
    await expect(
      client.verifyAccountHolderName({
        account_holder_name: "",
        account_identifier: { type: "iban", iban: "..." },
      }),
    ).rejects.toMatchObject({ type: "validation_error" });
  });

  it("verifyAccountHolderName returns match result", async () => {
    mockFetch(200, { result: "match" });
    const client = await makeClient();
    const result = await client.verifyAccountHolderName({
      account_holder_name: "Jane Doe",
      account_identifier: {
        type: "sort_code_account_number",
        sort_code: "040004",
        account_number: "12345678",
      },
    });
    expect(result.result).toBe("match");
  });

  it("verifyAccountHolderName returns no_match", async () => {
    mockFetch(200, { result: "no_match" });
    const client = await makeClient();
    const result = await client.verifyAccountHolderName({
      account_holder_name: "Wrong Name",
      account_identifier: { type: "iban", iban: "GB29NWBK60161331926819" },
    });
    expect(result.result).toBe("no_match");
  });

  it("createAccountHolderVerification returns pending resource", async () => {
    mockFetch(201, { id: "ahv-001", status: "pending" });
    const client = await makeClient();
    const result = await client.createAccountHolderVerification({
      account_holder_name: "Jane Doe",
      account_identifier: { type: "iban", iban: "..." },
    });
    expect(result.status).toBe("pending");
  });

  it("getAccountHolderVerification returns completed resource", async () => {
    mockFetch(200, { id: "ahv-001", status: "verified", match_score: 0.97 });
    const client = await makeClient();
    const result = await client.getAccountHolderVerification("ahv-001");
    expect(result.status).toBe("verified");
    expect(result.match_score).toBe(0.97);
  });
});
