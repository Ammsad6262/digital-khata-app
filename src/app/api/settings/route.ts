/**
 * /api/settings
 *
 * GET    → fetch current settings (business name, currency, PIN status)
 * PATCH  → update business name / currency / currencySymbol / timezone
 */

import { NextRequest } from "next/server";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    return ok(settings);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const settings = await updateSettings(data as Parameters<typeof updateSettings>[0]);
    return ok(settings);
  } catch (error) {
    return fail(error);
  }
}
