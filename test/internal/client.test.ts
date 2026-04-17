import { describe, it, expect } from "vitest";
import { TruelayerBankClient } from "../../src/client.js";
import { TruelayerError } from "../../src/error.js";

describe("TruelayerBankClient.create", () => {
  it("creates client with valid options", async () => {
    const client = await TruelayerBankClient.create({
      clientId: "test-id",
      clientSecret: "test-secret",
      environment: "sandbox",
    });
    expect(client).toBeInstanceOf(TruelayerBankClient);
    expect(client.isSandbox).toBe(true);
    expect(client.environment).toBe("sandbox");
  });

  it("creates client for live environment", async () => {
    const client = await TruelayerBankClient.create({
      clientId: "id",
      clientSecret: "s",
      environment: "live",
    });
    expect(client.isSandbox).toBe(false);
    expect(client.environment).toBe("live");
  });

  it("throws on missing clientId", async () => {
    await expect(
      TruelayerBankClient.create({ clientId: "", clientSecret: "s" }),
    ).rejects.toBeInstanceOf(TruelayerError);
  });

  it("throws on missing clientSecret", async () => {
    await expect(
      TruelayerBankClient.create({ clientId: "id", clientSecret: "" }),
    ).rejects.toBeInstanceOf(TruelayerError);
  });

  it("throws on invalid signing key PEM", async () => {
    // May throw TruelayerError (our wrapper) or a DOMException from SubtleCrypto
    await expect(
      TruelayerBankClient.create({
        clientId: "id",
        clientSecret: "s",
        signingKeyPem: "not-a-pem",
        signingKeyId: "kid",
      }),
    ).rejects.toThrow();
  });

  it("exposes all domain sub-clients", async () => {
    const client = await TruelayerBankClient.create({ clientId: "id", clientSecret: "s" });
    expect(client.auth).toBeDefined();
    expect(client.payments).toBeDefined();
    expect(client.payouts).toBeDefined();
    expect(client.merchant).toBeDefined();
    expect(client.mandates).toBeDefined();
    expect(client.data).toBeDefined();
    expect(client.verification).toBeDefined();
    expect(client.signupPlus).toBeDefined();
    expect(client.tracking).toBeDefined();
    expect(client.webhooks).toBeDefined();
  });

  it("each call produces a unique internal storeId", async () => {
    const c1 = await TruelayerBankClient.create({ clientId: "id", clientSecret: "s" });
    const c2 = await TruelayerBankClient.create({ clientId: "id", clientSecret: "s" });
    expect(c1.storeId).not.toBe(c2.storeId);
  });
});
