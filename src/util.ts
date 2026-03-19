export type DecodedJWT<Payload extends Record<string, unknown> = Record<string, unknown>> =
  {
    raw: string;
    header: Record<string, unknown>;
    payload: Payload;
    signature: string;
  };

function base64UrlDecodeToUtf8(input: string): string {
  // base64url -> base64
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(padLen);
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseJsonObject(label: string, s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      throw new Error(`${label} is not an object`);
    }
    return v as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JWT ${label}: ${msg}`);
  }
}

/**
 * Decode (not decrypt) a JWT.
 *
 * - JWTs are signed, not encrypted (unless you're using JWE).
 * - This does NOT verify the signature.
 */
export function decryptJWT<
  Payload extends Record<string, unknown> = Record<string, unknown>,
>(
  token: string,
  opts?: { validateExp?: boolean; nowSeconds?: number }
): DecodedJWT<Payload> {
  if (!token || typeof token !== "string") {
    throw new Error("JWT token must be a non-empty string");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format (expected 3 parts)");
  }

  const [h, p, sig] = parts;
  const header = parseJsonObject("header", base64UrlDecodeToUtf8(h));
  const payload = parseJsonObject("payload", base64UrlDecodeToUtf8(p)) as Payload;

  if (opts?.validateExp) {
    const exp = (payload as Record<string, unknown>).exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) {
      throw new Error("JWT payload missing numeric exp");
    }
    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (now >= exp) throw new Error("JWT is expired");
  }

  return { raw: token, header, payload, signature: sig };
}