import { describe, it, expect } from "vitest";
import { TruelayerError } from "../../src/error.js";

describe("TruelayerError", () => {
  it("sets name to TruelayerError", () => {
    const err = new TruelayerError({ type: "unknown" });
    expect(err.name).toBe("TruelayerError");
    expect(err).toBeInstanceOf(TruelayerError);
    expect(err).toBeInstanceOf(Error);
  });

  it("formats API error message", () => {
    const err = new TruelayerError({
      type: "not_found",
      status: 404,
      title: "Not Found",
      detail: "gone",
      traceId: "trace-1",
    });
    expect(err.message).toContain("404");
    expect(err.message).toContain("Not Found");
    expect(err.message).toContain("trace-1");
  });

  it("formats non-API error message", () => {
    const err = new TruelayerError({ type: "network_error", cause: new Error("ECONNREFUSED") });
    expect(err.message).toContain("network_error");
  });

  describe("fromResponse", () => {
    it("classifies 404 as not_found", () => {
      const headers = new Headers({ "tl-trace-id": "trace-abc" });
      const err = TruelayerError.fromResponse({ title: "Not Found", detail: "gone" }, headers, 404);
      expect(err.type).toBe("not_found");
      expect(err.status).toBe(404);
      expect(err.traceId).toBe("trace-abc");
    });

    it("classifies 401 as unauthorized", () => {
      const err = TruelayerError.fromResponse({}, new Headers(), 401);
      expect(err.type).toBe("unauthorized");
    });

    it("classifies 429 as rate_limited", () => {
      const err = TruelayerError.fromResponse({}, new Headers(), 429);
      expect(err.type).toBe("rate_limited");
    });

    it("classifies 500+ as server_error", () => {
      const err = TruelayerError.fromResponse({}, new Headers(), 503);
      expect(err.type).toBe("server_error");
    });

    it("sets shouldRetry from Tl-Should-Retry header", () => {
      const err = TruelayerError.fromResponse({}, new Headers({ "tl-should-retry": "true" }), 500);
      expect(err.shouldRetry).toBe(true);
    });
  });

  describe("predicates", () => {
    it("isRetryable is true for network_error", () => {
      expect(new TruelayerError({ type: "network_error", shouldRetry: true }).isRetryable).toBe(
        true,
      );
    });

    it("isRetryable is true for 429, 500, 503", () => {
      for (const s of [429, 500, 502, 503, 504]) {
        expect(new TruelayerError({ type: "rate_limited", status: s }).isRetryable).toBe(true);
      }
    });

    it("isRetryable is false for 4xx client errors", () => {
      for (const s of [400, 401, 403, 404, 409]) {
        expect(new TruelayerError({ type: "not_found", status: s }).isRetryable).toBe(false);
      }
    });

    it("isNotFound is true for 404", () => {
      expect(new TruelayerError({ type: "not_found", status: 404 }).isNotFound).toBe(true);
    });

    it("isRateLimited is true for 429", () => {
      expect(new TruelayerError({ type: "rate_limited", status: 429 }).isRateLimited).toBe(true);
    });

    it("isServerError is true for 5xx", () => {
      expect(new TruelayerError({ type: "server_error", status: 500 }).isServerError).toBe(true);
      expect(new TruelayerError({ type: "server_error", status: 503 }).isServerError).toBe(true);
    });
  });

  describe("static factories", () => {
    it("network() sets type and shouldRetry", () => {
      const err = TruelayerError.network(new TypeError("fetch failed"));
      expect(err.type).toBe("network_error");
      expect(err.shouldRetry).toBe(true);
    });

    it("signingRequired() sets type", () => {
      const err = TruelayerError.signingRequired();
      expect(err.type).toBe("signing_required");
      expect(err.shouldRetry).toBe(false);
    });

    it("validation() sets type", () => {
      const err = TruelayerError.validation("missing field");
      expect(err.type).toBe("validation_error");
      expect(err.message).toContain("missing field");
    });
  });
});
