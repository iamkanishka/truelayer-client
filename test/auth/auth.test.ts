import { describe, it, expect, vi } from "vitest";
import { mockFetch } from "../helpers.js";
import { AuthClient, PAYMENTS_SCOPES, DATA_SCOPES } from "../../src/auth/auth.js";
import { MemoryTokenStore } from "../../src/auth/token-store.js";
import { TruelayerError } from "../../src/error.js";
import { buildConfig } from "../../src/config.js";
import { tokenFromResponse, isExpired } from "../../src/auth/token.js";

const cfg = buildConfig({
  clientId: "test-id",
  clientSecret: "test-secret",
  redirectUri: "https://example.com/callback",
  environment: "sandbox",
});

function makeAuth() {
  const store = new MemoryTokenStore();
  const config = { ...cfg, tokenStore: store };
  return new AuthClient(config, "store-001", store);
}

const TOKEN_RESP = {
  access_token: "at-123",
  refresh_token: "rt-abc",
  expires_in: 3600,
  token_type: "Bearer",
  scope: "payments",
};

describe("AuthClient.authLink", () => {
  it("builds a URL with required params", () => {
    const auth = makeAuth();
    const url = auth.authLink({ scopes: ["payments"], state: "csrf-xyz" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("test-id");
    expect(parsed.searchParams.get("scope")).toBe("payments");
    expect(parsed.searchParams.get("state")).toBe("csrf-xyz");
  });

  it("throws when scopes is empty", () => {
    const auth = makeAuth();
    expect(() => auth.authLink({ scopes: [], state: "s" })).toThrow(TruelayerError);
  });

  it("throws when state is empty", () => {
    const auth = makeAuth();
    expect(() => auth.authLink({ scopes: ["payments"], state: "" })).toThrow(TruelayerError);
  });

  it("includes optional params", () => {
    const auth = makeAuth();
    const url = auth.authLink({
      scopes: ["payments"],
      state: "s",
      nonce: "n1",
      providers: ["ob-monzo"],
      enableMock: true,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("nonce")).toBe("n1");
    expect(parsed.searchParams.get("providers")).toBe("ob-monzo");
    expect(parsed.searchParams.get("enable_mock")).toBe("true");
  });

  it("throws when redirectUri not configured", () => {
    const cfg2 = buildConfig({ clientId: "id", clientSecret: "s" });
    const store2 = new MemoryTokenStore();
    const auth = new AuthClient(cfg2, "sid", store2);
    expect(() => auth.authLink({ scopes: ["payments"], state: "s" })).toThrow(TruelayerError);
  });
});

describe("AuthClient.exchangeCode", () => {
  it("exchanges code and caches token", async () => {
    mockFetch(200, TOKEN_RESP);
    const auth = makeAuth();
    const token = await auth.exchangeCode("auth-code", "payments");
    expect(token.accessToken).toBe("at-123");
    expect(token.tokenType).toBe("payments");
    expect(isExpired(token)).toBe(false);
  });

  it("throws on 400 response", async () => {
    mockFetch(400, { title: "Bad Request", detail: "invalid_grant" });
    const auth = makeAuth();
    await expect(auth.exchangeCode("bad", "payments")).rejects.toBeInstanceOf(TruelayerError);
  });
});

describe("AuthClient.clientCredentials", () => {
  it("fetches and caches payments token", async () => {
    mockFetch(200, TOKEN_RESP);
    const auth = makeAuth();
    const token = await auth.clientCredentials([...PAYMENTS_SCOPES], "payments");
    expect(token.accessToken).toBe("at-123");
    expect(token.tokenType).toBe("payments");
  });

  it("returns cached token on second call without HTTP", async () => {
    mockFetch(200, TOKEN_RESP);
    const auth = makeAuth();
    await auth.clientCredentials([...PAYMENTS_SCOPES], "payments");
    const fetchMock = vi.mocked(globalThis.fetch);
    const callsBefore = fetchMock.mock.calls.length;
    await auth.clientCredentials([...PAYMENTS_SCOPES], "payments");
    expect(fetchMock.mock.calls.length).toBe(callsBefore); // no new calls
  });

  it("refetches after token expires", async () => {
    const store = new MemoryTokenStore();
    const expiredToken = tokenFromResponse(
      { access_token: "old", expires_in: 0, token_type: "Bearer", scope: "payments" },
      "payments",
    );
    await store.put("store-001", "payments", expiredToken);
    const config = { ...cfg, tokenStore: store };
    const auth = new AuthClient(config, "store-001", store);
    mockFetch(200, { ...TOKEN_RESP, access_token: "new-token" });
    const token = await auth.clientCredentials([...PAYMENTS_SCOPES], "payments");
    expect(token.accessToken).toBe("new-token");
  });

  it("isolates payments and data tokens", async () => {
    let scope = "";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = new URLSearchParams(init?.body as string);
        scope = body.get("scope") ?? "";
        return new Response(
          JSON.stringify({ ...TOKEN_RESP, access_token: `tok-${scope}`, scope }),
          {
            status: 200,
            headers: new Headers({ "Content-Type": "application/json" }),
          },
        );
      }),
    );
    const auth = makeAuth();
    const pt = await auth.clientCredentials([...PAYMENTS_SCOPES], "payments");
    const dt = await auth.clientCredentials([...DATA_SCOPES], "data");
    expect(pt.tokenType).toBe("payments");
    expect(dt.tokenType).toBe("data");
    expect(pt.accessToken).not.toBe(dt.accessToken);
  });
});

describe("AuthClient.validToken", () => {
  it("throws when no token stored", async () => {
    const auth = makeAuth();
    await expect(auth.validToken("data")).rejects.toBeInstanceOf(TruelayerError);
  });

  it("returns live token when not expired", async () => {
    const store = new MemoryTokenStore();
    const tok = tokenFromResponse(TOKEN_RESP, "payments");
    await store.put("sid", "payments", tok);
    const auth = new AuthClient({ ...cfg, tokenStore: store }, "sid", store);
    const result = await auth.validToken("payments");
    expect(result.accessToken).toBe("at-123");
  });

  it("auto-refreshes expired token with refresh_token", async () => {
    const store = new MemoryTokenStore();
    const expired = tokenFromResponse({ ...TOKEN_RESP, expires_in: 0 }, "data");
    await store.put("sid", "data", expired);
    const auth = new AuthClient({ ...cfg, tokenStore: store }, "sid", store);
    mockFetch(200, { ...TOKEN_RESP, access_token: "refreshed", scope: "accounts" });
    const result = await auth.validToken("data");
    expect(result.accessToken).toBe("refreshed");
  });

  it("throws for expired token without refresh_token", async () => {
    const store = new MemoryTokenStore();
    const expired = tokenFromResponse(
      { access_token: "old", expires_in: 0, token_type: "Bearer" },
      "data",
    );
    await store.put("sid", "data", expired);
    const auth = new AuthClient({ ...cfg, tokenStore: store }, "sid", store);
    await expect(auth.validToken("data")).rejects.toBeInstanceOf(TruelayerError);
  });
});

describe("Token helpers", () => {
  it("tokenFromResponse applies 30s buffer", () => {
    const tok = tokenFromResponse(TOKEN_RESP, "payments");
    const diffSec = (tok.expiresAt.getTime() - Date.now()) / 1000;
    expect(diffSec).toBeGreaterThan(3560);
    expect(diffSec).toBeLessThan(3580);
  });

  it("isExpired returns false for fresh token", () => {
    const tok = tokenFromResponse(TOKEN_RESP, "payments");
    expect(isExpired(tok)).toBe(false);
  });

  it("isExpired returns true for expired token", () => {
    const tok = tokenFromResponse({ ...TOKEN_RESP, expires_in: 0 }, "payments");
    expect(isExpired(tok)).toBe(true);
  });
});
