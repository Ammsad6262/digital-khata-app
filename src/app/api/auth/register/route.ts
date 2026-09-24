/**
 * POST /api/auth/register
 * Body: { name, email, password }
 * Returns: { user, token } + sets httpOnly cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { registerUser, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<{ name: string; email: string; password: string }>(req);
    if (error || !data) return fail(new Error(error || "Invalid request body."));

    const result = await registerUser(data!);

    const res = ok({ user: result.user });
    // Set httpOnly cookie with the JWT token
    res.cookies.set(AUTH_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return res;
  } catch (error) {
    return fail(error);
  }
}
