import { TruelayerError } from "./error.js";
import type { Config } from "./config.js";

export interface TelemetryEvent {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly durationMs: number;
}

export type TelemetryHook = (event: TelemetryEvent) => void;

export interface RequestOptions {
  readonly method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

/**
 * Execute a JSON API request using the native Fetch API.
 *
 * - Throws `TruelayerError` for non-2xx responses (RFC 7807 parsed).
 * - Throws `TruelayerError` with `type: "network_error"` for transport failures.
 * - Emits a telemetry event after every request via `config.onRequest`.
 */
export async function jsonRequest<T = unknown>(config: Config, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "truelayer-client-ts/1.0.0",
    ...opts.headers,
  };

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, config.requestTimeoutMs);

  const startMs = Date.now();

  let response: Response;
  try {
    response = await fetch(opts.url, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new TruelayerError({
        type: "timeout",
        shouldRetry: true,
        message: `Request timed out after ${config.requestTimeoutMs}ms: ${opts.method} ${opts.url}`,
      });
    }
    throw TruelayerError.network(err);
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - startMs;
  config.onRequest?.({
    method: opts.method,
    url: opts.url,
    status: response.status,
    durationMs,
  });

  if (response.status >= 200 && response.status < 300) {
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as unknown as T;
    }
    const text = await response.text();
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new TruelayerError({
        type: "decode_error",
        message: "Failed to parse response body as JSON",
      });
    }
  }

  // Non-2xx — parse RFC 7807 problem+json body
  let errorBody: Record<string, unknown> = {};
  try {
    const text = await response.text();
    if (text) {
      errorBody = JSON.parse(text) as Record<string, unknown>;
    }
  } catch {
    // ignore parse errors for error body
  }

  throw TruelayerError.fromResponse(errorBody, response.headers, response.status);
}

/**
 * Execute an `application/x-www-form-urlencoded` POST request.
 * Used exclusively for OAuth2 token-endpoint calls.
 */
export async function formPost<T = unknown>(
  config: Config,
  url: string,
  params: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  const startMs = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "truelayer-client-ts/1.0.0",
      },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new TruelayerError({
        type: "timeout",
        shouldRetry: true,
        message: `Token request timed out after ${config.requestTimeoutMs}ms`,
      });
    }
    throw TruelayerError.network(err);
  } finally {
    clearTimeout(timer);
  }

  config.onRequest?.({
    method: "POST",
    url,
    status: response.status,
    durationMs: Date.now() - startMs,
  });

  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    if (text) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // ignore
  }

  if (response.status >= 200 && response.status < 300) {
    return body as T;
  }

  throw TruelayerError.fromResponse(body, response.headers, response.status);
}
