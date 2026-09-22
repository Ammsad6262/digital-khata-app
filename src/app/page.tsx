/**
 * Root page — redirects to /dashboard.
 *
 * `force-dynamic` prevents Next.js 16 from trying to statically prerender
 * this page (which would execute the redirect at build time and fail).
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function HomePage() {
  redirect("/dashboard");
}
