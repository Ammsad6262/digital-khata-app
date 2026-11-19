/**
 * Which kind of client is calling?
 *
 * The web app authenticates with an httpOnly cookie, so JavaScript never sees
 * the JWT. The native app has no cookie jar: it asks for the token in the
 * response body and stores it in the device keychain/keystore.
 *
 * Returning the token to a browser would undo the httpOnly protection (any XSS
 * could read it), so the token is only included when the caller explicitly
 * identifies itself as the app. The header cannot be forged cross-origin
 * without a CORS preflight, and this API answers no CORS preflight, so a web
 * page cannot obtain the token this way.
 */

import type { NextRequest } from "next/server";

export function isMobileClient(req: NextRequest): boolean {
  return (req.headers.get("x-client") ?? "").toLowerCase() === "mobile";
}