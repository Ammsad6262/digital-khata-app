/**
 * /api/settings
 *
 * GET    → fetch current user's settings (business name, currency, PIN status, theme)
 * PATCH  → update business name / currency / currencySymbol / timezone / customUnits / theme
 *
 * SECURITY: userId is derived from the JWT cookie via requireUserId().
 */

import { NextRequest } from "next/server";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const settings = await getSettings(userId);
    return ok(settings);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const settings = await updateSettings(userId, data as Parameters<typeof updateSettings>[1]);
    return ok(settings);
  } catch (error) {
    return fail(error);
  }
}
