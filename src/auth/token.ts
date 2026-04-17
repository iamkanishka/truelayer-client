/**
 * OAuth2 token with expiry tracking and strict type isolation.
 *
 * Payments tokens and Data tokens are stored in separate slots enforced
 * by the `tokenType` discriminant — a Data token can never authorise
 * a Payments API call.
 */

export type TokenType = "payments" | "data";

export interface Token {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly tokenType: TokenType;
  readonly scopes: string[];
  readonly expiresAt: Date;
}

/** Build a Token from a raw OAuth2 response with a 30-second expiry buffer. */
export function tokenFromResponse(resp: Record<string, unknown>, tokenType: TokenType): Token {
  const expiresIn = typeof resp["expires_in"] === "number" ? resp["expires_in"] : 3600;
  const expiresAt = new Date(Date.now() + (expiresIn - 30) * 1000);

  const scopeStr = typeof resp["scope"] === "string" ? resp["scope"] : "";

  return {
    accessToken: resp["access_token"] as string,
    refreshToken: typeof resp["refresh_token"] === "string" ? resp["refresh_token"] : undefined,
    tokenType,
    scopes: scopeStr ? scopeStr.split(" ") : [],
    expiresAt,
  };
}

/** Returns `true` when the token is expired or within the 30-second buffer. */
export function isExpired(token: Token): boolean {
  return Date.now() >= token.expiresAt.getTime();
}

/**
 * Returns the string value for the Authorization header: `"Bearer <token>"`.
 * Use with `{ Authorization: bearerToken(token) }` or spread `...bearerHeaders(token)`.
 */
export function bearerToken(token: Token): string {
  return `Bearer ${token.accessToken}`;
}

/** Returns `{ Authorization: "Bearer <token>" }` — ready to spread into a headers object. */
export function bearerHeaders(token: Token): Record<string, string> {
  return { Authorization: bearerToken(token) };
}

/** @deprecated Use bearerHeaders() or bearerToken(). Kept for compatibility. */
export function bearerHeader(token: Token): Record<string, string> {
  return bearerHeaders(token);
}
