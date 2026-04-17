import { describe, it, expect } from "vitest";
import { buildConfig } from "../../src/config.js";
import { TruelayerError } from "../../src/error.js";

describe("buildConfig", () => {
  const base = { clientId: "id", clientSecret: "secret" };

  it("builds a valid config", () => {
    const cfg = buildConfig(base);
    expect(cfg.clientId).toBe("id");
    expect(cfg.environment).toBe("sandbox");
    expect(cfg.apiUrl).toBe("https://api.truelayer-sandbox.com");
    expect(cfg.maxRetries).toBe(3);
  });

  it("accepts live environment", () => {
    const cfg = buildConfig({ ...base, environment: "live" });
    expect(cfg.apiUrl).toBe("https://api.truelayer.com");
    expect(cfg.authUrl).toBe("https://auth.truelayer.com");
  });

  it("throws on missing clientId", () => {
    expect(() => buildConfig({ clientId: "", clientSecret: "s" }))
      .toThrow(TruelayerError);
  });

  it("throws on missing clientSecret", () => {
    expect(() => buildConfig({ clientId: "id", clientSecret: "" }))
      .toThrow(TruelayerError);
  });

  it("throws on invalid environment", () => {
    expect(() => buildConfig({ ...base, environment: "staging" as "live" }))
      .toThrow(TruelayerError);
  });

  it("applies custom options", () => {
    const cfg = buildConfig({ ...base, maxRetries: 5, requestTimeoutMs: 60_000, baseRetryDelayMs: 500 });
    expect(cfg.maxRetries).toBe(5);
    expect(cfg.requestTimeoutMs).toBe(60_000);
    expect(cfg.baseRetryDelayMs).toBe(500);
  });
});
