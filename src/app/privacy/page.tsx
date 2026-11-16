import type { Metadata } from "next";
import { LegalPageView } from "@/components/legal/LegalPageView";
import { PRIVACY_POLICY } from "@/content/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Dukhata collects, why, who else sees it, and how to delete it.",
};

export default function PrivacyPage() {
  return <LegalPageView doc={PRIVACY_POLICY} />;
}
