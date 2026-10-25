/**
 * Public password-reset page.
 *
 * The email is prefilled when the admin shares the reset link from the admin
 * page. The code itself is never put in the URL.
 */

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string | string[] }>;
}) {
  const params = await searchParams;
  const email = typeof params.email === "string" ? params.email : "";

  return <ResetPasswordForm initialEmail={email} />;
}
