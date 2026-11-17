/**
 * POST /api/auth/reset-pin
 *
 * Removes the security PIN after the owner confirms with a code emailed to
 * their address.
 *
 * Why this exists: the PIN gate had no way out. A shopkeeper who forgot the PIN
 * was locked out of their own khata permanently — the PIN screen had no reset,
 * and signing out did not help because the PIN lives on the account, not the
 * session. Whoever can read the owner's email can now clear it.
 *
 * Deliberately does NOT require an active subscription: a locked-out owner must
 * be able to get back in even if their licence has lapsed.
 */

import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { requireActionConfirmation } from "@/lib/account/require-action-confirmation";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type Body = { confirmToken?: string; confirmCode?: string };

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req, { requireActiveSubscription: false });

    const { data } = await parseJsonBody<Body>(req);

    requireActionConfirmation({
      userId,
      action: "reset_pin",
      token: data?.confirmToken,
      code: data?.confirmCode,
    });

    // updateMany rather than update: a user without a Setting row still succeeds
    // (and there is nothing to clear).
    await prisma.setting.updateMany({
      where: { userId },
      data: { ownerPinHash: null },
    });

    return ok({ reset: true });
  } catch (error) {
    return fail(error);
  }
}