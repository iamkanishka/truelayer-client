/**
 * Structured error type for all TruelayerBankClient operations.
 *
 * Every public API method throws a `TruelayerError` on failure,
 * or returns the typed result on success.
 */

export type ErrorType =
  | "api_error"
  | "auth_error"
  | "validation_error"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "rate_limited"
  | "server_error"
  | "signing_required"
  | "replay_attack"
  | "signature_invalid"
  | "network_error"
  | "decode_error"
  | "timeout"
  | "unknown";

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export class TruelayerError extends Error {
  readonly type: ErrorType;
  readonly status?: number;
  readonly traceId?: string;
  readonly shouldRetry: boolean;
  readonly title?: string;
  readonly detail?: string;
  readonly errors?: FieldError[];
  readonly cause?: unknown;

  constructor(params: {
    type: ErrorType;
    status?: number;
    traceId?: string;
    shouldRetry?: boolean;
    title?: string;
    detail?: string;
    errors?: FieldError[];
    cause?: unknown;
    message?: string;
  }) {
    const msg =
      params.message ??
      (params.status != null
        ? `TrueLayer API ${params.status} ${params.title ?? ""}: ${params.detail ?? ""} (trace_id=${params.traceId ?? "unknown"})`
        : `TrueLayer [${params.type}]: ${String(params.cause ?? "unknown error")}`);

    super(msg, { cause: params.cause });
    this.name = "TruelayerError";
    this.type = params.type;
    this.status = params.status;
    this.traceId = params.traceId;
    this.shouldRetry = params.shouldRetry ?? false;
    this.title = params.title;
    this.detail = params.detail;
    this.errors = params.errors;
    this.cause = params.cause;

    // Maintain proper prototype chain in compiled JS
    Object.setPrototypeOf(this, TruelayerError.prototype);
  }

  /** Build from a non-2xx API response. */
  static fromResponse(
    body: Record<string, unknown>,
    headers: Headers,
    status: number,
  ): TruelayerError {
    return new TruelayerError({
      type: classifyStatus(status),
      status,
      traceId: headers.get("tl-trace-id") ?? undefined,
      shouldRetry: headers.get("tl-should-retry") === "true",
      title: typeof body["title"] === "string" ? body["title"] : undefined,
      detail: typeof body["detail"] === "string" ? body["detail"] : undefined,
      errors: Array.isArray(body["errors"]) ? (body["errors"] as FieldError[]) : undefined,
    });
  }

  /** Build from a network/transport failure. */
  static network(cause: unknown): TruelayerError {
    return new TruelayerError({
      type: "network_error",
      shouldRetry: true,
      cause,
    });
  }

  /** Build for missing signing key configuration. */
  static signingRequired(): TruelayerError {
    return new TruelayerError({
      type: "signing_required",
      message: "Request signing is required. Configure signingKeyPem and signingKeyId.",
    });
  }

  /** Build for invalid input. */
  static validation(message: string): TruelayerError {
    return new TruelayerError({ type: "validation_error", message });
  }

  // ── Predicates ─────────────────────────────────────────────────────────────

  get isRetryable(): boolean {
    return (
      this.shouldRetry ||
      this.type === "network_error" ||
      this.type === "timeout" ||
      (this.status != null && [429, 500, 502, 503, 504].includes(this.status))
    );
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isServerError(): boolean {
    return (this.status ?? 0) >= 500;
  }
}

function classifyStatus(status: number): ErrorType {
  switch (status) {
    case 400:
    case 422:
      return "validation_error";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 429:
      return "rate_limited";
    default:
      return status >= 500 ? "server_error" : "api_error";
  }
}
