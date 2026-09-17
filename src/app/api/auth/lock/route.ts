/**
 * POST /api/auth/lock
 *
 * Clears the session cookie (manual lock).
 * No body required.
 */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true, data: { locked: true } });
  res.headers.set("Set-Cookie", clearSessionCookie());
  return res;
}
