/**
 * POST /api/auth/logout
 * Clears the auth cookie + PIN session cookie.
 */

import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true, data: { loggedOut: true } });
  // Clear the JWT auth cookie
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  // Also clear the PIN session cookie (if present)
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
