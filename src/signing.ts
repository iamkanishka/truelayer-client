import { TruelayerError } from "./error.js";

export interface Signer {
  readonly keyId: string;
  sign(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<string>;
}

/**
 * Create an ES512 JWS signer from a PEM-encoded EC private key (P-521).
 *
 * Uses the Web Crypto API (`globalThis.crypto.subtle`) — zero external dependencies.
 * Available natively in Node 18+, Deno, Bun, and all modern browsers.
 *
 * @param pemKey  PEM-encoded PKCS8 EC private key (secp521r1)
 * @param keyId   Key ID registered in the TrueLayer Console
 */
export async function createSigner(
  pemKey: string,
  keyId: string,
): Promise<Signer> {
  if (!pemKey || pemKey.trim() === "") {
    throw TruelayerError.validation("signingKeyPem must not be empty");
  }
  if (!keyId || keyId.trim() === "") {
    throw TruelayerError.validation("signingKeyId must not be empty");
  }

  const key = await importPrivateKey(pemKey);

  return {
    keyId,
    async sign(
      method: string,
      path: string,
      headers: Record<string, string>,
      body: string,
    ): Promise<string> {
      const sortedNames = Object.keys(headers)
        .map((k) => k.toLowerCase())
        .sort();

      const headerLines = sortedNames.map((name) => {
        const val = headers[name] ?? headers[name.toUpperCase()] ?? "";
        return `${name}: ${val}`;
      });

      const jwsHeaderJson = JSON.stringify({
        alg: "ES512",
        kid: keyId,
        "tl-version": "2",
        "tl-headers": sortedNames.join(","),
        iat: Math.floor(Date.now() / 1000),
      });

      const encodedHeader = base64UrlEncode(
        new TextEncoder().encode(jwsHeaderJson),
      );

      const signingInput = [method.toUpperCase(), path, ...headerLines, body].join(
        "\n",
      );

      const toSign = `${encodedHeader}.${signingInput}`;
      const digest = await globalThis.crypto.subtle.digest(
        "SHA-512",
        new TextEncoder().encode(toSign),
      );

      const rawSig = await globalThis.crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-512" },
        key,
        digest,
      );

      // SubtleCrypto returns P1363 format (r || s) directly for ECDSA
      const encodedSig = base64UrlEncode(new Uint8Array(rawSig));
      return `${encodedHeader}..${encodedSig}`;
    },
  };
}

// ── PEM import ────────────────────────────────────────────────────────────────

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const stripped = pem
    .replace(/-----BEGIN (?:EC |PRIVATE |)KEY-----/g, "")
    .replace(/-----END (?:EC |PRIVATE |)KEY-----/g, "")
    .replace(/\s+/g, "");

  const der = base64Decode(stripped);

  try {
    // Try PKCS8 first (most common from openssl pkcs8 -nocrypt)
    return await globalThis.crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "ECDSA", namedCurve: "P-521" },
      false,
      ["sign"],
    );
  } catch {
    throw new TruelayerError({
      type: "validation_error",
      message:
        "Failed to import signing key. Ensure it is a PEM-encoded PKCS8 EC private key (P-521). " +
        'Generate with: openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-521 | ' +
        'openssl pkcs8 -nocrypt -out signing_key.pem',
    });
  }
}

// ── Encoding helpers ──────────────────────────────────────────────────────────

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64Decode(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
