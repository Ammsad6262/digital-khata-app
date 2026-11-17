import type { ReactNode } from "react";
import type { Metadata } from "next";

/**
 * /verify-email layout.
 *
 * The page must never be indexed: it is an account-specific step, and a
 * crawler hitting it would only ever see a redirect to /login.
 */
export const metadata: Metadata = {
  title: "Verify email",
  robots: { index: false, follow: false },
};

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}