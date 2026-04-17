import { describe, it, expect } from "vitest";
import { tokenFromResponse, isExpired, bearerHeader } from "../../src/auth/token.js";

const BASE_RESP = {
  access_token: "at-xyz",
  refresh_token: "rt-abc",
  expires_in: 3600,
  token_type: "Bearer",
  scope: "payments",
};

describe("tokenFromResponse", () => {
  it("builds token with correct fields", () => {
    const tok = tokenFromResponse(BASE_RESP, "payments");
    expect(tok.accessToken).toBe("at-xyz");
    expect(tok.refreshToken).toBe("rt-abc");
    expect(tok.tokenType).toBe("payments");
    expect(tok.scopes).toEqual(["payments"]);
  });

  it("applies 30-second buffer to expiresAt", () => {
    const tok = tokenFromResponse(BASE_RESP, "payments");
    const diffSec = (tok.expiresAt.getTime() - Date.now()) / 1000;
    expect(diffSec).toBeGreaterThan(3558);
    expect(diffSec).toBeLessThan(3575);
  });

  it("handles missing refresh_token", () => {
    const tok = tokenFromResponse({ ...BASE_RESP, refresh_token: undefined }, "data");
    expect(tok.refreshToken).toBeUndefined();
  });

  it("handles empty scope string", () => {
    const tok = tokenFromResponse({ ...BASE_RESP, scope: "" }, "payments");
    expect(tok.scopes).toEqual([]);
  });

  it("handles multi-word scope string", () => {
    const tok = tokenFromResponse({ ...BASE_RESP, scope: "accounts balance transactions" }, "data");
    expect(tok.scopes).toEqual(["accounts", "balance", "transactions"]);
  });
});

describe("isExpired", () => {
  it("returns false for a fresh token", () => {
    const tok = tokenFromResponse(BASE_RESP, "payments");
    expect(isExpired(tok)).toBe(false);
  });

  it("returns true for an expired token", () => {
    const tok = tokenFromResponse({ ...BASE_RESP, expires_in: 0 }, "payments");
    expect(isExpired(tok)).toBe(true);
  });

  it("returns true when expiresAt is in the past", () => {
    const tok = { ...tokenFromResponse(BASE_RESP, "payments"), expiresAt: new Date(Date.now() - 1000) };
    expect(isExpired(tok)).toBe(true);
  });
});

describe("bearerHeader", () => {
  it("returns correct Authorization header", () => {
    const tok = tokenFromResponse(BASE_RESP, "payments");
    const h = bearerHeader(tok);
    expect(h.Authorization).toBe("Bearer at-xyz");
  });
});
