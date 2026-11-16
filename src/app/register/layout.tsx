import type { Metadata } from "next";

/**
 * /register is a conversion page, not content: noindex so it does not compete
 * with the landing page. The landing page carries the search-facing copy.
 */
export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Dukhata account and start your free 14-day trial.",
  robots: { index: false, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
