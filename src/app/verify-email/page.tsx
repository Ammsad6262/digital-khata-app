import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";

/**
 * /verify-email — the six-digit email verification step.
 * `robots: { index: false }` lives in ./layout.tsx.
 */
export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}