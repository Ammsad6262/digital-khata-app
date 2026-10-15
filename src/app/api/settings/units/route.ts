/**
 * POST /api/settings/units
 *
 * V6 (Smart Entry): Add a single custom unit to the user's Setting.customUnits
 * list. Used by the inline AddProductWizard when the user wants to use a unit
 * that isn't in the built-in list (e.g. "sack", "mawa", "packet").
 *
 * Body: { unit: string }  (1-20 chars, trimmed, lowercased)
 *
 * Response 200: { customUnits: string[] } — the updated list of custom units
 * Response 400: invalid input OR unit already exists
 *
 * Security:
 *   - userId is taken from the JWT cookie (requireActiveAccess) — NEVER from
 *     the request body.
 *   - The customUnits list belongs ONLY to this user.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { tServer } from "@/lib/i18n/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

// Built-in units that ship with the app — these can't be re-added as "custom"
// (would be redundant). The same list is used by ProductForm + SettingsPage.
const BUILTIN_UNITS = [
  "piece", "kg", "box", "dozen", "litre", "metre",
  "pack", "bag", "bottle", "carton",
];

const addUnitSchema = z.object({
  unit: z
    .string()
    .trim()
    .min(1, "api.units.nameRequired")
    .max(20, "api.units.nameTooLong")
    .transform((v) => v.toLowerCase()),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) {
      return fail(new BadRequestError(error || tServer("api.errors.invalidBody")));
    }

    const parsed = addUnitSchema.safeParse(data);
    if (!parsed.success) {
      return fail(new BadRequestError(parsed.error.issues[0]?.message ?? tServer("api.units.invalid")));
    }

    const unitToAdd = parsed.data.unit;

    // Load current settings (lazily creates the row if missing)
    const settings = await getSettings(userId);
    const existingCustom = settings.customUnits ?? [];

    // Reject if already in built-in OR already in user's custom list
    if (BUILTIN_UNITS.includes(unitToAdd)) {
      throw new BadRequestError("api.units.builtinExists", undefined, { name: unitToAdd });
    }
    if (existingCustom.includes(unitToAdd)) {
      throw new BadRequestError("api.units.alreadyExists", undefined, { name: unitToAdd });
    }

    // Append + persist
    const updated = [...existingCustom, unitToAdd];
    const newSettings = await updateSettings(userId, { customUnits: updated });

    return ok({ customUnits: newSettings.customUnits });
  } catch (error) {
    return fail(error);
  }
}
