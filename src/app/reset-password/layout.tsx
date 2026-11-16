import type { Metadata } from "next";

/** Utility page: noindex, and it is also disallowed in robots.txt. */
export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
