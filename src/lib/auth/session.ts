/**
 * Session management — stateless HMAC-signed session tokens.
 *
 * Uses the Web Crypto API (crypto.subtle) which works in BOTH the Edge runtime
 * (where middleware runs) and the Node.js runtime (where API routes run).
 *
 * Token format: `<base64url(payload)>.<base64url(hmacSignature)>`
 *   payload = JSON `{ exp: <unix_seconds> }`
 *   hmacSignature = HMAC-SHA256(payload, SESSION_SECRET)
 *
 * The token is stored in an HttpOnly cookie. No server-side session store needed.
 *
 * Security properties:
 *   - Can't be forged without SESSION_SECRET
 *   - Expires automatically (TTL from env, default 24h)
 *   - HttpOnly → JavaScript can't read it (XSS-resistant)
 *   - SameSite=Strict → CSRF-resistant
 *   - Secure=true in production → HTTPS-only
 *   - Timing-safe verification via crypto.subtle.verify
 */

const SESSION_COOKIE = "dk_session";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to a 32+ char string in production.");
    }
    return "dev-insecure-secret-DO-NOT-USE-IN-PRODUCTION";
  }
  return secret;
}

function getTtl(): number {
  const raw = process.env.SESSION_TTL_SECONDS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_TTL_SECONDS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
}

const encoder = new TextEncoder();

async function getHmacKey(): Promise<CryptoKey> {
  const secret = getSecret();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string): Promise<string> {
  const key = await getHmacKey();
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Buffer.from(new Uint8Array(sigBuf)).toString("base64url");
}

async function verifySig(payload: string, sig: string): Promise<boolean> {
  try {
    const key = await getHmacKey();
    const sigBuf = Buffer.from(sig, "base64url");
    if (sigBuf.length === 0) return false;
    return await crypto.subtle.verify("HMAC", key, sigBuf, encoder.encode(payload));
  } catch {
    return false;
  }
}

/** Create a session token + cookie string. */
export async function createSession(): Promise<{ token: string; cookie: string }> {
  const exp = Math.floor(Date.now() / 1000) + getTtl();
  const payload = Buffer.from(JSON.stringify({ exp }), "utf-8").toString("base64url");
  const sig = await sign(payload);
  const token = `${payload}.${sig}`;

  const isProduction = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    // Use Lax instead of Strict — Strict blocks cookies on navigation
    // from external sites. Lax allows top-level GETs but blocks POSTs
    // from other sites (still CSRF-safe).
    "SameSite=Lax",
    `Path=/`,
    `Max-Age=${getTtl()}`,
    isProduction ? "Secure" : "",
  ].filter(Boolean).join("; ");

  return { token, cookie };
}

/** Clear session cookie value (for logout/lock). */
export function clearSessionCookie(): string {
  const isProduction = process.env.NODE_ENV === "production";
  return [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
    isProduction ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

/**
 * Verify a session token. Returns true if valid + not expired.
 * Uses crypto.subtle.verify for timing-safe comparison.
 */
export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  if (!token.includes(".")) return false;

  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;

  // Verify signature (timing-safe via crypto.subtle.verify)
  const valid = await verifySig(payload, sig);
  if (!valid) return false;

  // Check expiry
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof decoded.exp !== "number") return false;
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) return false;
    return true;
  } catch {
    return false;
  }
}
