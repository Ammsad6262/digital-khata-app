import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/services/auth";

/**
 * App entry point — what the Android app (and the installed PWA) opens on.
 *
 * The marketing landing page lives at `/` and must stay there for search
 * engines, but it must never be the first thing someone sees inside the
 * installed app. Opening `/start` sends a signed-in owner straight to the
 * dashboard and everyone else to sign in / sign up.
 *
 * The decision is made on the server, so there is no flash of the wrong screen
 * and no dependence on client JavaScript.
 */
export const dynamic = "force-dynamic";

export default async function StartPage() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token).catch(() => null) : null;
  redirect(session ? "/dashboard" : "/login");
}
