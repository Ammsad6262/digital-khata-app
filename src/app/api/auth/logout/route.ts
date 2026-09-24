/**
 * POST /api/auth/logout
 * Clears the auth cookie.
 */

import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/services/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true, data: { loggedOut: true } });
  res.cookies.delete(AUTH_COOKIE_NAME);
  return res;
}
