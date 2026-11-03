/**
 * GET /api/khata-assistant/questions?lang=en|ur|roman-ur
 *
 * Returns the 20 prepared questions grouped into categories, localised. The UI
 * can render the catalogue instantly from the shared module; this route exists
 * so the catalogue is also verifiable over HTTP and reusable by other clients.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail } from "@/lib/utils/api";
import { getKhataCatalog } from "@/lib/khata-assistant/service";
import type { KhataLanguage } from "@/lib/khata-assistant/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const LANGUAGES: KhataLanguage[] = ["en", "ur", "roman-ur", "mixed"];

export async function GET(req: NextRequest) {
  try {
    await requireActiveAccess(req);
    const raw = req.nextUrl.searchParams.get("lang");
    const language =
      raw && (LANGUAGES as string[]).includes(raw) ? (raw as KhataLanguage) : "en";
    return ok(getKhataCatalog(language));
  } catch (error) {
    return fail(error);
  }
}
