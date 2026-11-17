/**
 * Login page (server gate).
 *
 * A signed-in visitor who lands here goes straight to the dashboard, so the
 * "Log in" and "Use in browser" buttons do the obvious thing. Signed-out
 * visitors get the form below.
 *
 * Why the redirect lives here and not on "/": the marketing page is the shop
 * window, and it must stay reachable while signed in.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, verifyToken } from "@/lib/services/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token).catch(() => null) : null;
  if (session) redirect("/dashboard");
  return <LoginForm />;
}
