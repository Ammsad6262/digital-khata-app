import type { Metadata } from "next";

/**
 * /login is a utility page with no search value: keep it out of the index so it
 * cannot compete with the landing page for brand queries. `follow` stays true so
 * link equity still flows to the pages it links to.
 */
export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Dukhata account.",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
