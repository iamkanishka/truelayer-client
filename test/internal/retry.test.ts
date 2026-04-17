import { describe, it, expect } from "vitest";
import { withRetry, type RetryPolicy } from "../../src/retry.js";
import { TruelayerError } from "../../src/error.js";

const FAST: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5, multiplier: 2 };

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const result = await withRetry(FAST, async () => "ok");
    expect(result).toBe("ok");
  });

  it("retries on retryable error and succeeds", async () => {
    let calls = 0;
    const result = await withRetry(FAST, async () => {
      calls++;
      if (calls < 3)
        throw new TruelayerError({ type: "server_error", status: 503, shouldRetry: true });
      return "done";
    });
    expect(result).toBe("done");
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withRetry(FAST, async () => {
        calls++;
        throw TruelayerError.fromResponse({}, new Headers(), 404);
      }),
    ).rejects.toBeInstanceOf(TruelayerError);
    expect(calls).toBe(1);
  });

  it("exhausts retries and throws last error", async () => {
    let calls = 0;
    await expect(
      withRetry(FAST, async () => {
        calls++;
        throw new TruelayerError({ type: "server_error", status: 500, shouldRetry: true });
      }),
    ).rejects.toBeInstanceOf(TruelayerError);
    expect(calls).toBe(3);
  });

  it("does not retry non-TruelayerError", async () => {
    let calls = 0;
    await expect(
      withRetry(FAST, async () => {
        calls++;
        throw new Error("unexpected");
      }),
    ).rejects.toThrow("unexpected");
    expect(calls).toBe(1);
  });
});
