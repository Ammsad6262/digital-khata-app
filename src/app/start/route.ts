import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/services/auth";

/**
 * App entry point — what the Android app and the installed PWA open on.
 *
 * The marketing landing page stays at `/` for search engines, but it must never
 * be the first thing someone sees inside the installed app. This endpoint sends
 * a signed-in owner straight to the dashboard and everyone else to sign in /
 * sign up.
 *
 * Implemented as a route handler rather than a page so the server answers with a
 * real HTTP redirect (307) instead of a 200 that has to redirect in the browser.
 * The decision is made server-side, so the first painted screen is already the
 * right one and nothing depends on client JavaScript.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token).catch(() => null) : null;

  return NextResponse.redirect(
    new URL(session ? "/dashboard" : "/login", req.nextUrl.origin),
    307,
  );
}
